package jam

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/fkb/jamapp/server/internal/auth"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Notifier interface {
	Send(userID uuid.UUID, msgType string, payload any)
}

type Handler struct {
	DB       *pgxpool.Pool
	Registry *Registry
	Notifier Notifier
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

type inviteReq struct {
	FriendID string `json:"friend_id"`
}

type inviteNotification struct {
	RoomID       uuid.UUID `json:"room_id"`
	FromUserID   uuid.UUID `json:"from_user_id"`
	FromUsername string    `json:"from_username"`
}

// Invite sends a jam invite notification to a friend.
func (h *Handler) Invite(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	roomID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid room id")
		return
	}
	var req inviteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	friendID, err := uuid.Parse(req.FriendID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid friend id")
		return
	}

	// Caller must be a current member of the room (or host of an empty room).
	var isMember bool
	h.Registry.mu.Lock()
	if hub, ok := h.Registry.hubs[roomID]; ok {
		hub.mu.Lock()
		_, inRoom := hub.members[uid]
		isMember = inRoom || hub.hostID == uid
		hub.mu.Unlock()
	}
	h.Registry.mu.Unlock()
	if !isMember {
		writeErr(w, http.StatusForbidden, "not in this room")
		return
	}

	// Must be friends.
	var cnt int
	err = h.DB.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM friendships
		WHERE status = 'accepted'
		AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
	`, uid, friendID).Scan(&cnt)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if cnt == 0 {
		writeErr(w, http.StatusForbidden, "not friends")
		return
	}

	var fromUsername string
	_ = h.DB.QueryRow(r.Context(), `SELECT username FROM users WHERE id = $1`, uid).Scan(&fromUsername)

	if h.Notifier != nil {
		h.Notifier.Send(friendID, "jam_invite", inviteNotification{
			RoomID:       roomID,
			FromUserID:   uid,
			FromUsername: fromUsername,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// Create makes a new jam room with the caller as host.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	id, err := h.Registry.CreateRoom(r.Context(), uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"room_id": id})
}

type roomInfo struct {
	RoomID       uuid.UUID `json:"room_id"`
	HostID       uuid.UUID `json:"host_id"`
	HostUsername string    `json:"host_username"`
	Members      []Member  `json:"members"`
}

// Get returns room metadata.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var info roomInfo
	err = h.DB.QueryRow(r.Context(), `
		SELECT jr.id, jr.host_id, u.username
		FROM jam_rooms jr JOIN users u ON u.id = jr.host_id
		WHERE jr.id = $1
	`, id).Scan(&info.RoomID, &info.HostID, &info.HostUsername)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "room not found")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	// Include live members if hub exists.
	info.Members = []Member{}
	h.Registry.mu.Lock()
	if hub, ok := h.Registry.hubs[id]; ok {
		hub.mu.Lock()
		info.Members = hub.membersLocked()
		hub.mu.Unlock()
	}
	h.Registry.mu.Unlock()
	writeJSON(w, http.StatusOK, info)
}

// WS handles the websocket upgrade + message loop.
// Auth is via ?token=<jwt> (header auth doesn't work with ws.WebSocket in browsers).
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Handler) WS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}
	claims, err := auth.ParseToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	roomID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid room id", http.StatusBadRequest)
		return
	}

	var username string
	err = h.DB.QueryRow(r.Context(), `SELECT username FROM users WHERE id = $1`,
		claims.UserID).Scan(&username)
	if err != nil {
		http.Error(w, "user lookup failed", http.StatusInternalServerError)
		return
	}

	hub, err := h.Registry.GetOrCreate(r.Context(), roomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	send := make(chan []byte, 16)
	member := Member{UserID: claims.UserID, Username: username}

	hub.join(member, send)

	// Writer
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		defer conn.Close()
		for {
			select {
			case msg, ok := <-send:
				if !ok {
					_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// Reader
	conn.SetReadLimit(1 << 20) // 1 MB
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var env Message
		if err := json.Unmarshal(raw, &env); err != nil {
			continue
		}
		switch env.Type {
		case "state":
			var s StateMsg
			if err := json.Unmarshal(env.Payload, &s); err == nil {
				hub.onState(claims.UserID, s)
			}
		case "leave":
			goto done
		}
	}
done:
	hub.leave(claims.UserID, send)
	_ = conn.Close()
}
