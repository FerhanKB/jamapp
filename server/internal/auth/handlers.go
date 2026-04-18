package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	DB *pgxpool.Pool
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Token    string    `json:"token"`
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	c.Username = strings.TrimSpace(strings.ToLower(c.Username))
	if len(c.Username) < 3 || len(c.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "username >=3 chars, password >=8 chars")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(c.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash failed")
		return
	}

	id := uuid.New()
	_, err = h.DB.Exec(r.Context(),
		`INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
		id, c.Username, string(hash),
	)
	if err != nil {
		if strings.Contains(err.Error(), "users_username_key") {
			writeErr(w, http.StatusConflict, "username taken")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	token, err := IssueToken(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token issue failed")
		return
	}
	writeJSON(w, http.StatusCreated, authResponse{Token: token, UserID: id, Username: c.Username})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	c.Username = strings.TrimSpace(strings.ToLower(c.Username))

	var id uuid.UUID
	var hash string
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, password_hash FROM users WHERE username = $1`, c.Username,
	).Scan(&id, &hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(c.Password)); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := IssueToken(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token issue failed")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{Token: token, UserID: id, Username: c.Username})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	uid, ok := UserID(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no user")
		return
	}
	var username string
	err := h.DB.QueryRow(r.Context(), `SELECT username FROM users WHERE id = $1`, uid).Scan(&username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user_id": uid, "username": username})
}

var _ context.Context = context.Background()
