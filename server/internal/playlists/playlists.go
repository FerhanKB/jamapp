package playlists

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

type Track struct {
	Source     string `json:"source"`
	SourceID   string `json:"source_id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Cover      string `json:"cover"`
	DurationMS int    `json:"duration_ms"`
}

type Playlist struct {
	ID      uuid.UUID `json:"id"`
	OwnerID uuid.UUID `json:"owner_id"`
	Name    string    `json:"name"`
	Tracks  []Track   `json:"tracks,omitempty"`
}

type Handler struct {
	DB *pgxpool.Pool
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
	rows, err := h.DB.Query(r.Context(),
		`SELECT id, owner_id, name FROM playlists WHERE owner_id = $1 ORDER BY created_at DESC`, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	out := []Playlist{}
	for rows.Next() {
		var p Playlist
		if err := rows.Scan(&p.ID, &p.OwnerID, &p.Name); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"playlists": out})
}

type createReq struct {
	Name string `json:"name"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	id := uuid.New()
	_, err := h.DB.Exec(r.Context(),
		`INSERT INTO playlists (id, owner_id, name) VALUES ($1, $2, $3)`,
		id, uid, req.Name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusCreated, Playlist{ID: id, OwnerID: uid, Name: req.Name})
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var p Playlist
	err = h.DB.QueryRow(r.Context(),
		`SELECT id, owner_id, name FROM playlists WHERE id = $1 AND owner_id = $2`,
		pid, uid).Scan(&p.ID, &p.OwnerID, &p.Name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "not found")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	rows, err := h.DB.Query(r.Context(),
		`SELECT source, source_id, title, artist, cover, duration_ms
		 FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position`, pid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	p.Tracks = []Track{}
	for rows.Next() {
		var t Track
		if err := rows.Scan(&t.Source, &t.SourceID, &t.Title, &t.Artist, &t.Cover, &t.DurationMS); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		p.Tracks = append(p.Tracks, t)
	}
	writeJSON(w, http.StatusOK, p)
}

type renameReq struct {
	Name string `json:"name"`
}

func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req renameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	tag, err := h.DB.Exec(r.Context(),
		`UPDATE playlists SET name = $1 WHERE id = $2 AND owner_id = $3`,
		req.Name, pid, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tag, err := h.DB.Exec(r.Context(),
		`DELETE FROM playlists WHERE id = $1 AND owner_id = $2`, pid, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AddTrack appends a track at position = max(position)+1.
func (h *Handler) AddTrack(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var t Track
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if t.Source == "" || t.SourceID == "" || t.Title == "" {
		writeErr(w, http.StatusBadRequest, "source, source_id, title required")
		return
	}

	var owner uuid.UUID
	err = h.DB.QueryRow(r.Context(),
		`SELECT owner_id FROM playlists WHERE id = $1`, pid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "playlist not found")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if owner != uid {
		writeErr(w, http.StatusForbidden, "not owner")
		return
	}

	var nextPos int
	_ = h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = $1`,
		pid).Scan(&nextPos)

	_, err = h.DB.Exec(r.Context(),
		`INSERT INTO playlist_tracks (playlist_id, position, source, source_id, title, artist, cover, duration_ms)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		pid, nextPos, t.Source, t.SourceID, t.Title, t.Artist, t.Cover, t.DurationMS)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"position": nextPos})
}

// RemoveTrack deletes by position and compacts remaining positions.
func (h *Handler) RemoveTrack(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserID(r.Context())
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var owner uuid.UUID
	err = h.DB.QueryRow(r.Context(),
		`SELECT owner_id FROM playlists WHERE id = $1`, pid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "playlist not found")
			return
		}
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if owner != uid {
		writeErr(w, http.StatusForbidden, "not owner")
		return
	}

	var pos int
	if _, err := readIntQuery(r, "position", &pos); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(),
		`DELETE FROM playlist_tracks WHERE playlist_id = $1 AND position = $2`, pid, pos); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = $1 AND position > $2`, pid, pos); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeErr(w, http.StatusInternalServerError, "db commit error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
