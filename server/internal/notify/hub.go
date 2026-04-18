// Package notify provides a per-user server-push channel for ephemeral
// notifications (jam invites, etc.) over WebSocket.
package notify

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/fkb/jamapp/server/internal/auth"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Hub struct {
	mu    sync.Mutex
	conns map[uuid.UUID][]chan []byte

	// Optional callbacks fired when a user's first connection opens /
	// their last one closes. Used by presence tracking.
	OnConnect    func(userID uuid.UUID)
	OnDisconnect func(userID uuid.UUID)
}

func NewHub() *Hub {
	return &Hub{conns: map[uuid.UUID][]chan []byte{}}
}

func (h *Hub) Send(userID uuid.UUID, msgType string, payload any) {
	raw, _ := json.Marshal(payload)
	env, _ := json.Marshal(Message{Type: msgType, Payload: raw})
	h.mu.Lock()
	for _, c := range h.conns[userID] {
		select {
		case c <- env:
		default:
		}
	}
	h.mu.Unlock()
}

func (h *Hub) add(userID uuid.UUID, ch chan []byte) {
	h.mu.Lock()
	h.conns[userID] = append(h.conns[userID], ch)
	h.mu.Unlock()
}

func (h *Hub) remove(userID uuid.UUID, ch chan []byte) {
	h.mu.Lock()
	list := h.conns[userID]
	for i, c := range list {
		if c == ch {
			h.conns[userID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(h.conns[userID]) == 0 {
		delete(h.conns, userID)
	}
	h.mu.Unlock()
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Hub) WS(w http.ResponseWriter, r *http.Request) {
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
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("notify upgrade: %v", err)
		return
	}

	ch := make(chan []byte, 16)
	h.add(claims.UserID, ch)
	if h.OnConnect != nil {
		h.OnConnect(claims.UserID)
	}
	defer func() {
		h.remove(claims.UserID, ch)
		if h.OnDisconnect != nil {
			h.OnDisconnect(claims.UserID)
		}
	}()

	done := make(chan struct{})

	// Writer
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		defer conn.Close()
		for {
			select {
			case msg := <-ch:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					close(done)
					return
				}
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					close(done)
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Reader (just keeps the conn alive & detects close)
	conn.SetReadLimit(512)
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	select {
	case <-done:
	default:
		close(done)
	}
	_ = conn.Close()
}
