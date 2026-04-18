package friends

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/fkb/jamapp/server/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	DB *pgxpool.Pool
}

type Friend struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	// direction: who sent the pending request. Only set for pending.
	Direction string `json:"direction,omitempty"` // "incoming" | "outgoing" | ""
}

type listResponse struct {
	Friends  []Friend `json:"friends"`
	Pending  []Friend `json:"pending"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())

	rows, err := h.DB.Query(r.Context(), `
		SELECT
			f.from_user, f.to_user, f.status,
			CASE WHEN f.from_user = $1 THEN u2.username ELSE u1.username END AS other_username,
			CASE WHEN f.from_user = $1 THEN f.to_user ELSE f.from_user END   AS other_id
		FROM friendships f
		JOIN users u1 ON u1.id = f.from_user
		JOIN users u2 ON u2.id = f.to_user
		WHERE f.from_user = $1 OR f.to_user = $1
		ORDER BY f.created_at DESC
	`, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	var resp listResponse
	resp.Friends = []Friend{}
	resp.Pending = []Friend{}
	for rows.Next() {
		var from, to, other uuid.UUID
		var status, otherUsername string
		if err := rows.Scan(&from, &to, &status, &otherUsername, &other); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		f := Friend{UserID: other, Username: otherUsername}
		if status == "accepted" {
			resp.Friends = append(resp.Friends, f)
		} else {
			if from == uid {
				f.Direction = "outgoing"
			} else {
				f.Direction = "incoming"
			}
			resp.Pending = append(resp.Pending, f)
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

type inviteReq struct {
	Username string `json:"username"`
}

func (h *Handler) Invite(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	var req inviteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	uname := strings.TrimSpace(strings.ToLower(req.Username))
	if uname == "" {
		writeErr(w, http.StatusBadRequest, "username required")
		return
	}

	var target uuid.UUID
	err := h.DB.QueryRow(r.Context(),
		`SELECT id FROM users WHERE username = $1`, uname).Scan(&target)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "user not found")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if target == uid {
		writeErr(w, http.StatusBadRequest, "cannot befriend yourself")
		return
	}

	// If a row exists in either direction, handle special cases.
	var existingFrom, existingTo uuid.UUID
	var existingStatus string
	err = h.DB.QueryRow(r.Context(), `
		SELECT from_user, to_user, status FROM friendships
		WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
	`, uid, target).Scan(&existingFrom, &existingTo, &existingStatus)
	if err == nil {
		if existingStatus == "accepted" {
			writeErr(w, http.StatusConflict, "already friends")
			return
		}
		if existingFrom == uid {
			writeErr(w, http.StatusConflict, "invite already sent")
			return
		}
		// There's an incoming invite — auto-accept.
		if _, err := h.DB.Exec(r.Context(), `
			UPDATE friendships SET status = 'accepted', accepted_at = now()
			WHERE from_user = $1 AND to_user = $2
		`, target, uid); err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO friendships (from_user, to_user, status) VALUES ($1, $2, 'pending')
	`, uid, target)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "pending"})
}

// Accept the invite where :userId is the sender.
func (h *Handler) Accept(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	fromID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	tag, err := h.DB.Exec(r.Context(), `
		UPDATE friendships SET status = 'accepted', accepted_at = now()
		WHERE from_user = $1 AND to_user = $2 AND status = 'pending'
	`, fromID, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "no pending invite from that user")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Decline or cancel: removes any friendship row (either direction) between current user and :userId.
// Also covers unfriending an accepted friend.
func (h *Handler) Remove(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	other, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	tag, err := h.DB.Exec(r.Context(), `
		DELETE FROM friendships
		WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
	`, uid, other)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "no friendship")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
