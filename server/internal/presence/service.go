// Package presence tracks which users are connected (have a live notifications
// WS) and which jam room, if any, they're in. State changes are fanned out to
// the affected user's friends.
package presence

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type State struct {
	Online    bool       `json:"online"`
	JamRoomID *uuid.UUID `json:"jam_room_id,omitempty"`
}

type presenceEvent struct {
	UserID    uuid.UUID  `json:"user_id"`
	Online    bool       `json:"online"`
	JamRoomID *uuid.UUID `json:"jam_room_id"`
}

// Notifier is the subset of notify.Hub we need.
type Notifier interface {
	Send(userID uuid.UUID, msgType string, payload any)
}

type Service struct {
	db       *pgxpool.Pool
	notifier Notifier

	mu     sync.Mutex
	refs   map[uuid.UUID]int   // active connection count per user
	states map[uuid.UUID]State // last known state per user
}

func NewService(db *pgxpool.Pool, notifier Notifier) *Service {
	return &Service{
		db:       db,
		notifier: notifier,
		refs:     map[uuid.UUID]int{},
		states:   map[uuid.UUID]State{},
	}
}

// OnConnect is called when a user opens a notifications WS.
func (s *Service) OnConnect(userID uuid.UUID) {
	s.mu.Lock()
	s.refs[userID]++
	first := s.refs[userID] == 1
	state := s.states[userID]
	if first {
		state.Online = true
		s.states[userID] = state
	}
	s.mu.Unlock()
	if first {
		go s.broadcast(userID, state)
	}
}

// OnDisconnect is called when a notifications WS closes.
func (s *Service) OnDisconnect(userID uuid.UUID) {
	s.mu.Lock()
	if s.refs[userID] > 0 {
		s.refs[userID]--
	}
	last := s.refs[userID] == 0
	if last {
		delete(s.refs, userID)
	}
	state := s.states[userID]
	if last {
		state = State{Online: false}
		s.states[userID] = state
	}
	s.mu.Unlock()
	if last {
		go s.broadcast(userID, state)
	}
}

// SetJam records that userID joined a jam room.
func (s *Service) SetJam(userID, roomID uuid.UUID) {
	s.mu.Lock()
	state := s.states[userID]
	if state.JamRoomID != nil && *state.JamRoomID == roomID {
		s.mu.Unlock()
		return
	}
	rid := roomID
	state.JamRoomID = &rid
	if state.Online || s.refs[userID] > 0 {
		state.Online = true
	}
	s.states[userID] = state
	s.mu.Unlock()
	go s.broadcast(userID, state)
}

// ClearJam records that userID left their jam.
func (s *Service) ClearJam(userID uuid.UUID) {
	s.mu.Lock()
	state := s.states[userID]
	if state.JamRoomID == nil {
		s.mu.Unlock()
		return
	}
	state.JamRoomID = nil
	s.states[userID] = state
	s.mu.Unlock()
	go s.broadcast(userID, state)
}

// StatesFor returns the current state of each user id (defaults to offline).
func (s *Service) StatesFor(ids []uuid.UUID) map[uuid.UUID]State {
	out := make(map[uuid.UUID]State, len(ids))
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range ids {
		out[id] = s.states[id]
	}
	return out
}

func (s *Service) broadcast(userID uuid.UUID, state State) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT CASE WHEN from_user = $1 THEN to_user ELSE from_user END
		FROM friendships
		WHERE status = 'accepted'
		AND (from_user = $1 OR to_user = $1)
	`, userID)
	if err != nil {
		return
	}
	defer rows.Close()
	var friends []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if rows.Scan(&id) == nil {
			friends = append(friends, id)
		}
	}
	ev := presenceEvent{UserID: userID, Online: state.Online, JamRoomID: state.JamRoomID}
	for _, fid := range friends {
		s.notifier.Send(fid, "friend_presence", ev)
	}
}
