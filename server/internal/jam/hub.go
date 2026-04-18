package jam

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Message is the envelope passed on the wire.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Member struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
}

type memberConn struct {
	member Member
	send   chan []byte
}

// Hub holds the state for one jam room.
type Hub struct {
	RoomID uuid.UUID

	mu       sync.Mutex
	hostID   uuid.UUID
	members  map[uuid.UUID]*memberConn // userID -> conn (latest conn wins if user opens a second tab)
	order    []uuid.UUID               // join order; used to promote next host
	lastState *StateMsg                // last known playback state (relayed by host)

	onEmpty func(roomID uuid.UUID)
}

type StateMsg struct {
	Track      any    `json:"track"`       // opaque to server; client shape: {source, source_id, title, artist, cover, duration_ms} or null
	PositionMS int    `json:"position_ms"`
	Playing    bool   `json:"playing"`
	ServerTS   int64  `json:"server_ts"` // set by server on broadcast
	SenderID   string `json:"-"`
}

func newHub(roomID, hostID uuid.UUID, onEmpty func(uuid.UUID)) *Hub {
	return &Hub{
		RoomID:  roomID,
		hostID:  hostID,
		members: map[uuid.UUID]*memberConn{},
		onEmpty: onEmpty,
	}
}

// broadcast sends a message to every member, optionally excluding one user.
func (h *Hub) broadcast(msgType string, payload any, exclude ...uuid.UUID) {
	raw, _ := json.Marshal(payload)
	env, _ := json.Marshal(Message{Type: msgType, Payload: raw})
	skip := map[uuid.UUID]struct{}{}
	for _, id := range exclude {
		skip[id] = struct{}{}
	}
	h.mu.Lock()
	for uid, c := range h.members {
		if _, ok := skip[uid]; ok {
			continue
		}
		select {
		case c.send <- env:
		default:
		}
	}
	h.mu.Unlock()
}

type joinedPayload struct {
	YouID   uuid.UUID `json:"you_id"`
	HostID  uuid.UUID `json:"host_id"`
	Members []Member  `json:"members"`
	State   *StateMsg `json:"state,omitempty"`
}

func (h *Hub) join(m Member, send chan []byte) {
	h.mu.Lock()
	existing, wasPresent := h.members[m.UserID]
	if !wasPresent {
		h.order = append(h.order, m.UserID)
	}
	h.members[m.UserID] = &memberConn{member: m, send: send}
	ms := h.membersLocked()
	host := h.hostID
	state := h.lastState
	h.mu.Unlock()

	// If this user was already connected, close the old channel so the old writer goroutine exits.
	if wasPresent && existing != nil {
		// Closing tells the old writer to send CloseMessage and exit.
		defer func() {
			defer func() { recover() }() // paranoia: channel was already closed
			close(existing.send)
		}()
	}

	// Send 'joined' only to the (new) connection.
	raw, _ := json.Marshal(joinedPayload{
		YouID:   m.UserID,
		HostID:  host,
		Members: ms,
		State:   state,
	})
	env, _ := json.Marshal(Message{Type: "joined", Payload: raw})
	send <- env

	// Only announce to others on a true first join.
	if !wasPresent {
		h.broadcast("member_joined", m, m.UserID)
	}
}

// leave removes a user's connection. If `send` is non-nil, only leaves if that
// send channel is still the current one (otherwise it's a stale/replaced conn).
func (h *Hub) leave(userID uuid.UUID, send chan []byte) {
	h.mu.Lock()
	c, ok := h.members[userID]
	if !ok {
		h.mu.Unlock()
		return
	}
	if send != nil && c.send != send {
		// The user reconnected; don't evict the newer connection.
		h.mu.Unlock()
		return
	}
	// Safe close — the old-conn close already happened via the join path.
	func() {
		defer func() { recover() }()
		close(c.send)
	}()
	delete(h.members, userID)
	// Compact order list.
	pruned := h.order[:0]
	for _, id := range h.order {
		if id != userID {
			pruned = append(pruned, id)
		}
	}
	h.order = pruned

	var newHost *uuid.UUID
	if h.hostID == userID && len(h.order) > 0 {
		h.hostID = h.order[0]
		newHost = &h.hostID
	}
	empty := len(h.members) == 0
	h.mu.Unlock()

	h.broadcast("member_left", Member{UserID: userID})
	if newHost != nil {
		h.broadcast("host_changed", map[string]uuid.UUID{"host_id": *newHost})
	}
	if empty && h.onEmpty != nil {
		h.onEmpty(h.RoomID)
	}
}

func (h *Hub) membersLocked() []Member {
	out := make([]Member, 0, len(h.members))
	for _, id := range h.order {
		if c, ok := h.members[id]; ok {
			out = append(out, c.member)
		}
	}
	return out
}

// onState handles an incoming state message from a member.
// Only the host's messages are broadcast.
func (h *Hub) onState(fromUser uuid.UUID, state StateMsg) {
	h.mu.Lock()
	isHost := fromUser == h.hostID
	h.mu.Unlock()
	if !isHost {
		return
	}
	state.ServerTS = time.Now().UnixMilli()
	h.mu.Lock()
	s := state
	h.lastState = &s
	h.mu.Unlock()
	h.broadcast("state", state)
}
