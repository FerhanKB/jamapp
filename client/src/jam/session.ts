import { api } from "../api/client";
import { player } from "../player/player";
import { JamClient, type JamRoomState, type JamState } from "./client";
import { getYouTubeTrack } from "../api/youtube";
import type { Track } from "../api/types";

type Listener = (s: JamRoomState | null) => void;

const DRIFT_THRESHOLD_MS = 600;
const HOST_HEARTBEAT_MS = 2000;

let active: JamClient | null = null;
const listeners = new Set<Listener>();
let hostHeartbeat: ReturnType<typeof setInterval> | null = null;
let applyingRemoteState = false;
let lastAppliedTrackKey: string | null = null;

function notify() {
  listeners.forEach((fn) => fn(active?.getState() ?? null));
}

function startHostLoop(client: JamClient) {
  stopHostLoop();
  const push = () => {
    const p = player.getState();
    const track = p.track;
    client.sendState({
      track,
      position_ms: Math.floor(p.position * 1000),
      playing: p.playing,
    });
  };
  const unsub = player.subscribe(() => {
    if (!client.isHost() || applyingRemoteState) return;
    push();
  });
  hostHeartbeat = setInterval(() => {
    if (!client.isHost()) return;
    push();
  }, HOST_HEARTBEAT_MS);
  // Initial push
  push();
  return unsub;
}

function stopHostLoop() {
  if (hostHeartbeat) {
    clearInterval(hostHeartbeat);
    hostHeartbeat = null;
  }
}

async function applyRemoteState(s: JamState) {
  if (!s.track) return;
  const t = s.track as Track;
  const key = `${t.source}:${t.source_id}`;
  const targetSec = (s.position_ms + (Date.now() - s.server_ts)) / 1000;

  applyingRemoteState = true;
  try {
    const current = player.getState();
    const currentKey = current.track
      ? `${current.track.source}:${current.track.source_id}`
      : null;

    if (key !== lastAppliedTrackKey && key !== currentKey) {
      lastAppliedTrackKey = key;
      // For YouTube we may only have source_id — fetch full metadata.
      let full: Track = t;
      if (!t.title && t.source === "youtube") {
        try {
          full = await getYouTubeTrack(t.source_id);
        } catch {
          // fall through; t may already have enough fields
        }
      }
      await player.play(full);
      player.seek(Math.max(0, targetSec));
      if (!s.playing) player.pause();
      return;
    }

    const drift = Math.abs((current.position - targetSec) * 1000);
    if (drift > DRIFT_THRESHOLD_MS) {
      player.seek(Math.max(0, targetSec));
    }
    if (s.playing && !current.playing) player.resume();
    else if (!s.playing && current.playing) player.pause();
  } finally {
    // Small delay so the resulting player events don't trigger a push-back loop.
    setTimeout(() => {
      applyingRemoteState = false;
    }, 200);
  }
}

export async function startJam(): Promise<string> {
  const res = await api<{ room_id: string }>("/jam", { method: "POST" });
  await joinJam(res.room_id);
  return res.room_id;
}

export async function joinJam(roomId: string) {
  if (active && active.roomId === roomId) return;
  if (active) leaveJam();

  const client = new JamClient(roomId);
  active = client;
  lastAppliedTrackKey = null;

  client.subscribe(notify);
  client.onState((s) => {
    if (client.isHost()) return;
    void applyRemoteState(s);
  });
  client.connect();

  // Wait for `joined` to know whether we're host.
  await new Promise<void>((resolve) => {
    const unsub = client.subscribe((s) => {
      if (s.youId !== "") {
        unsub();
        resolve();
      }
    });
  });

  if (client.isHost()) {
    startHostLoop(client);
  } else {
    // As a guest, we don't emit; and if a state was delivered on join, apply it.
    const s = client.getState().lastServerState;
    if (s) void applyRemoteState(s);
  }
  notify();
}

export function leaveJam() {
  if (!active) return;
  stopHostLoop();
  active.leave();
  active = null;
  notify();
}

export function getJamState(): JamRoomState | null {
  return active?.getState() ?? null;
}

export function subscribeJam(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function inJam(): boolean {
  return active !== null;
}
