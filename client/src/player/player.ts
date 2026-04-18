import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../api/types";

type Listener = () => void;

const VOLUME_KEY = "jamapp.volume";

export interface PlayerState {
  track: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  loading: boolean;
  error: string | null;
  volume: number; // 0..1
  queue: Track[]; // upcoming tracks (does not include current)
  history: Track[]; // played tracks, most recent last
}

class Player {
  private audio = new Audio();
  private listeners = new Set<Listener>();
  private state: PlayerState;

  constructor() {
    const storedVol = Number(localStorage.getItem(VOLUME_KEY));
    const initialVol = isFinite(storedVol) && storedVol >= 0 && storedVol <= 1
      ? storedVol
      : 1;
    this.audio.volume = initialVol;

    this.state = {
      track: null,
      playing: false,
      position: 0,
      duration: 0,
      loading: false,
      error: null,
      volume: initialVol,
      queue: [],
      history: [],
    };

    this.audio.addEventListener("play", () => this.set({ playing: true }));
    this.audio.addEventListener("pause", () => this.set({ playing: false }));
    this.audio.addEventListener("timeupdate", () =>
      this.set({ position: this.audio.currentTime }),
    );
    this.audio.addEventListener("loadedmetadata", () =>
      this.set({ duration: this.audio.duration }),
    );
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("error", () =>
      this.set({ error: "audio error", loading: false, playing: false }),
    );
    this.audio.addEventListener("volumechange", () =>
      this.set({ volume: this.audio.volume }),
    );
  }

  getState(): PlayerState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  async play(track: Track) {
    // If we had a current track, push it to history.
    const prev = this.state.track;
    const history = prev ? [...this.state.history, prev] : this.state.history;
    this.set({
      track,
      loading: true,
      error: null,
      position: 0,
      duration: 0,
      history,
    });
    try {
      let url: string;
      if (track.source === "youtube") {
        url = await invoke<string>("resolve_youtube_audio", {
          videoId: track.source_id,
        });
      } else {
        throw new Error(`unsupported source: ${track.source}`);
      }
      this.audio.src = url;
      this.set({ loading: false });
      await this.audio.play();
    } catch (e) {
      this.set({
        loading: false,
        playing: false,
        error: e instanceof Error ? e.message : "play failed",
      });
    }
  }

  /** Enqueue at the end of the queue. */
  enqueue(track: Track) {
    this.set({ queue: [...this.state.queue, track] });
    // If nothing is currently playing, auto-start.
    if (!this.state.track && !this.state.loading) {
      void this.next();
    }
  }

  enqueueMany(tracks: Track[]) {
    if (tracks.length === 0) return;
    this.set({ queue: [...this.state.queue, ...tracks] });
    if (!this.state.track && !this.state.loading) {
      void this.next();
    }
  }

  /** Replace the queue with tracks and immediately play startIndex. */
  async playFromList(tracks: Track[], startIndex = 0) {
    if (tracks.length === 0) return;
    const current = tracks[startIndex];
    const rest = tracks.slice(startIndex + 1);
    this.set({ queue: rest });
    await this.play(current);
  }

  /** Move the queue head into current and play it. */
  async next() {
    const q = this.state.queue;
    if (q.length === 0) {
      // No next — stop.
      this.audio.pause();
      this.audio.currentTime = 0;
      this.set({ playing: false, position: 0 });
      return;
    }
    const [head, ...rest] = q;
    this.set({ queue: rest });
    await this.play(head);
  }

  /**
   * Previous: if we're more than 3s into the track, restart it. Otherwise
   * pop from history, pushing the current track back onto the queue head.
   */
  async previous() {
    if (this.state.position > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const hist = this.state.history;
    if (hist.length === 0) {
      this.audio.currentTime = 0;
      return;
    }
    const prev = hist[hist.length - 1];
    const newHist = hist.slice(0, -1);
    const current = this.state.track;
    const queue = current ? [current, ...this.state.queue] : this.state.queue;
    // Pop history manually since `play` would re-push the current track.
    this.set({ history: newHist, queue });
    // Now play `prev` without re-pushing history: temporarily move current into
    // queue via the set above, then call play which will re-push — undo that.
    const beforePlayHist = newHist;
    await this.play(prev);
    this.set({ history: beforePlayHist });
  }

  removeFromQueue(index: number) {
    const q = this.state.queue.slice();
    q.splice(index, 1);
    this.set({ queue: q });
  }

  clearQueue() {
    this.set({ queue: [] });
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this.audio.volume = clamped;
    localStorage.setItem(VOLUME_KEY, String(clamped));
  }

  pause() {
    this.audio.pause();
  }

  resume() {
    void this.audio.play();
  }

  seek(seconds: number) {
    this.audio.currentTime = seconds;
  }

  toggle() {
    if (this.audio.paused) this.resume();
    else this.pause();
  }

  private onEnded() {
    this.set({ playing: false });
    if (this.state.queue.length > 0) {
      void this.next();
    }
  }
}

export const player = new Player();
