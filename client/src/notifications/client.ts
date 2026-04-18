import { getToken } from "../api/client";

export interface JamInvite {
  room_id: string;
  from_user_id: string;
  from_username: string;
}

type Handler = (type: string, payload: unknown) => void;

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const WS_URL = BASE_URL.replace(/^http/, "ws");

let ws: WebSocket | null = null;
let handler: Handler | null = null;
let shouldReconnect = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function connectNotifications(onMessage: Handler) {
  handler = onMessage;
  shouldReconnect = true;
  open();
}

export function disconnectNotifications() {
  shouldReconnect = false;
  clearReconnect();
  handler = null;
  if (ws) {
    ws.close();
    ws = null;
  }
}

function open() {
  const token = getToken();
  if (!token) return;
  ws = new WebSocket(`${WS_URL}/notifications/ws?token=${encodeURIComponent(token)}`);
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (handler) handler(m.type, m.payload);
    } catch {
      // ignore
    }
  };
  ws.onclose = () => {
    ws = null;
    if (shouldReconnect) {
      clearReconnect();
      reconnectTimer = setTimeout(open, 2000);
    }
  };
  ws.onerror = () => {
    // let onclose handle reconnect
  };
}
