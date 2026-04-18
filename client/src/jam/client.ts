import type { Track } from "../api/types";
import { getToken } from "../api/client";

export interface Member {
  user_id: string;
  username: string;
}

export interface JamState {
  track: Track | null;
  position_ms: number;
  playing: boolean;
  server_ts: number;
  queue?: Track[];
}

export interface QueueAddPayload {
  track: import("../api/types").Track;
  from_user_id?: string;
}

export interface SkipPayload {
  from_user_id?: string;
}

type IncomingMessage =
  | { type: "joined"; payload: JoinedPayload }
  | { type: "member_joined"; payload: Member }
  | { type: "member_left"; payload: Member }
  | { type: "host_changed"; payload: { host_id: string } }
  | { type: "state"; payload: JamState }
  | { type: "queue_add"; payload: QueueAddPayload }
  | { type: "skip"; payload: SkipPayload };

interface JoinedPayload {
  you_id: string;
  host_id: string;
  members: Member[];
  state?: JamState | null;
}

export interface JamRoomState {
  roomId: string;
  youId: string;
  hostId: string;
  members: Member[];
  lastServerState: JamState | null;
  connected: boolean;
  error: string | null;
}

type Listener = (s: JamRoomState) => void;
type StateListener = (s: JamState) => void;
type ActionListener = (type: "queue_add" | "skip", payload: any) => void;

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const WS_URL = BASE_URL.replace(/^http/, "ws");

export class JamClient {
  readonly roomId: string;
  private ws: WebSocket | null = null;
  private state: JamRoomState;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private actionListeners = new Set<ActionListener>();

  constructor(roomId: string) {
    this.roomId = roomId;
    this.state = {
      roomId,
      youId: "",
      hostId: "",
      members: [],
      lastServerState: null,
      connected: false,
      error: null,
    };
  }

  connect() {
    const token = getToken();
    if (!token) {
      this.update({ error: "not authenticated" });
      return;
    }
    const url = `${WS_URL}/jam/${this.roomId}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => this.update({ connected: true, error: null });
    ws.onclose = () => {
      this.update({ connected: false });
      // For v1, don't auto-reconnect — jam disconnection usually means the user left.
    };
    ws.onerror = () => this.update({ error: "connection error" });
    ws.onmessage = (ev) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(msg);
    };
  }

  private handle(msg: IncomingMessage) {
    switch (msg.type) {
      case "joined":
        this.update({
          youId: msg.payload.you_id,
          hostId: msg.payload.host_id,
          members: msg.payload.members,
          lastServerState: msg.payload.state ?? null,
        });
        if (msg.payload.state) this.emitState(msg.payload.state);
        break;
      case "member_joined":
        this.update({
          members: [...this.state.members, msg.payload],
        });
        break;
      case "member_left":
        this.update({
          members: this.state.members.filter(
            (m) => m.user_id !== msg.payload.user_id,
          ),
        });
        break;
      case "host_changed":
        this.update({ hostId: msg.payload.host_id });
        break;
      case "state":
        this.update({ lastServerState: msg.payload });
        this.emitState(msg.payload);
        break;
      case "queue_add":
      case "skip":
        this.actionListeners.forEach((fn) => fn(msg.type, msg.payload));
        break;
    }
  }

  sendState(state: Omit<JamState, "server_ts">) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "state",
        payload: { ...state, server_ts: 0 },
      }),
    );
  }

  sendAction(type: "queue_add" | "skip" | "queue_remove", payload: unknown = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  onAction(fn: ActionListener): () => void {
    this.actionListeners.add(fn);
    return () => {
      this.actionListeners.delete(fn);
    };
  }

  isHost(): boolean {
    return this.state.hostId !== "" && this.state.hostId === this.state.youId;
  }

  leave() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "leave" }));
      } catch {
        // ignore
      }
    }
    this.ws?.close();
    this.ws = null;
  }

  getState(): JamRoomState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  private update(patch: Partial<JamRoomState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  private emitState(s: JamState) {
    this.stateListeners.forEach((fn) => fn(s));
  }
}
