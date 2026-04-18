export interface Presence {
  online: boolean;
  jamRoomId: string | null;
}

type Listener = () => void;

const states = new Map<string, Presence>();
const listeners = new Set<Listener>();

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

let version = 0;

export function subscribePresence(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function presenceVersion(): number {
  return version;
}

export function getPresence(userId: string): Presence {
  return states.get(userId) ?? { online: false, jamRoomId: null };
}

/** Called on WS `friend_presence` events. */
export function applyPresenceEvent(payload: {
  user_id: string;
  online: boolean;
  jam_room_id: string | null;
}) {
  states.set(payload.user_id, {
    online: payload.online,
    jamRoomId: payload.jam_room_id,
  });
  notify();
}

/** Called after fetching the friends list to seed presence from the REST response. */
export function seedPresence(
  seed: Array<{ user_id: string; online?: boolean; jam_room_id?: string | null }>,
) {
  for (const f of seed) {
    states.set(f.user_id, {
      online: !!f.online,
      jamRoomId: f.jam_room_id ?? null,
    });
  }
  notify();
}

export function clearPresence() {
  states.clear();
  notify();
}
