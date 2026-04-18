package jam

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Registry struct {
	DB *pgxpool.Pool

	mu    sync.Mutex
	hubs  map[uuid.UUID]*Hub
}

func NewRegistry(db *pgxpool.Pool) *Registry {
	return &Registry{
		DB:   db,
		hubs: map[uuid.UUID]*Hub{},
	}
}

// GetOrCreate fetches a room's hub, creating an in-memory hub for an existing DB row.
func (r *Registry) GetOrCreate(ctx context.Context, roomID uuid.UUID) (*Hub, error) {
	r.mu.Lock()
	if hub, ok := r.hubs[roomID]; ok {
		r.mu.Unlock()
		return hub, nil
	}
	r.mu.Unlock()

	var hostID uuid.UUID
	err := r.DB.QueryRow(ctx, `SELECT host_id FROM jam_rooms WHERE id = $1`, roomID).Scan(&hostID)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if hub, ok := r.hubs[roomID]; ok {
		return hub, nil
	}
	hub := newHub(roomID, hostID, r.removeHub)
	r.hubs[roomID] = hub
	return hub, nil
}

// CreateRoom creates a DB row and an in-memory hub.
func (r *Registry) CreateRoom(ctx context.Context, hostID uuid.UUID) (uuid.UUID, error) {
	id := uuid.New()
	_, err := r.DB.Exec(ctx,
		`INSERT INTO jam_rooms (id, host_id) VALUES ($1, $2)`, id, hostID)
	if err != nil {
		return uuid.Nil, err
	}
	r.mu.Lock()
	r.hubs[id] = newHub(id, hostID, r.removeHub)
	r.mu.Unlock()
	return id, nil
}

func (r *Registry) removeHub(roomID uuid.UUID) {
	r.mu.Lock()
	delete(r.hubs, roomID)
	r.mu.Unlock()
	// Remove the DB row so dead rooms don't accumulate.
	_, _ = r.DB.Exec(context.Background(),
		`DELETE FROM jam_rooms WHERE id = $1`, roomID)
}
