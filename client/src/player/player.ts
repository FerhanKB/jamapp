import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../api/types";

type Listener = () => void;

const VOLUME_KEY = "jamapp.volume";

// Start preloading the next track when the current one has this much remaining.
const PRELOAD_TRIGGER_REMAINING_SEC = 15;

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

interface Preloaded {
  track: Track;
  audio: HTMLAudioElement;
  url: string;
}

class Player {
  private audio = new Audio();
  private preload: Preloaded | null = null;
  private preloadInflight: string | null = null; // "source:id" currently being prepared
  private listeners = new Set<Listener>();
  private state: PlayerState;

  constructor() {
    const storedVol = Number(localStorage.getItem(VOLUME_KEY));
    const initialVol = isFinite(storedVol) && storedVol >= 0 && storedVol <= 1
      ? storedVol
      : 1;
    this.audio.volume = initialVol;
    this.audio.preload = "auto";

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

    this.bindAudio(this.audio);
  }

  private bindAudio(audio: HTMLAudioElement) {
    audio.addEventListener("play", () => {
      if (audio === this.audio) this.set({ playing: true });
    });
    audio.addEventListener("pause", () => {
      if (audio === this.audio) this.set({ playing: false });
    });
    audio.addEventListener("timeupdate", () => {
      if (audio !== this.audio) return;
      this.set({ position: audio.currentTime });
      this.maybeStartPreload();
    });
    audio.addEventListener("loadedmetadata", () => {
      if (audio === this.audio) this.set({ duration: audio.duration });
    });
    audio.addEventListener("ended", () => {
      if (audio === this.audio) this.onEnded();
    });
    audio.addEventListener("error", () => {
      if (audio === this.audio) {
        this.set({ error: "audio error", loading: false, playing: false });
      }
    });
    audio.addEventListener("volumechange", () => {
      if (audio === this.audio) this.set({ volume: audio.volume });
    });
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

  private trackKey(t: Track): string {
    return `${t.source}:${t.source_id}`;
  }

  private async resolveUrl(track: Track): Promise<string> {
    if (track.source === "youtube") {
      return invoke<string>("resolve_youtube_audio", { videoId: track.source_id });
    }
    throw new Error(`unsupported source: ${track.source}`);
  }

  async play(track: Track) {
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

    // If this is the preloaded track, swap its audio element in for zero-gap playback.
    if (this.preload && this.trackKey(this.preload.track) === this.trackKey(track)) {
      try {
        const old = this.audio;
        old.pause();
        old.src = "";
        const next = this.preload.audio;
        next.volume = old.volume;
        this.preload = null;
        this.audio = next;
        this.bindAudio(next);
        this.set({
          loading: false,
          duration: isFinite(next.duration) ? next.duration : 0,
        });
        await next.play();
        return;
      } catch (e) {
        this.set({
          loading: false,
          playing: false,
          error: e instanceof Error ? e.message : "play failed",
        });
        return;
      }
    }

    // Abandon any mismatched preload.
    this.discardPreload();

    try {
      const url = await this.resolveUrl(track);
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
    if (!this.state.track && !this.state.loading) {
      void this.next();
    } else {
      this.maybeStartPreload();
    }
  }

  enqueueMany(tracks: Track[]) {
    if (tracks.length === 0) return;
    this.set({ queue: [...this.state.queue, ...tracks] });
    if (!this.state.track && !this.state.loading) {
      void this.next();
    } else {
      this.maybeStartPreload();
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
      this.audio.pause();
      this.audio.currentTime = 0;
      this.set({ playing: false, position: 0 });
      this.discardPreload();
      return;
    }
    const [head, ...rest] = q;
    this.set({ queue: rest });
    await this.play(head);
  }

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
    this.set({ history: newHist, queue });
    const beforePlayHist = newHist;
    await this.play(prev);
    this.set({ history: beforePlayHist });
  }

  removeFromQueue(index: number) {
    const q = this.state.queue.slice();
    q.splice(index, 1);
    this.set({ queue: q });
    // If the preloaded track is no longer the queue head, drop it.
    if (this.preload && q[0] && this.trackKey(q[0]) !== this.trackKey(this.preload.track)) {
      this.discardPreload();
      this.maybeStartPreload();
    }
  }

  clearQueue() {
    this.set({ queue: [] });
    this.discardPreload();
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this.audio.volume = clamped;
    if (this.preload) this.preload.audio.volume = clamped;
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

  /**
   * If we're near the end of the current track and the next one hasn't been
   * prepared yet, start fetching its audio URL and let the hidden <audio>
   * buffer it in the background.
   */
  private maybeStartPreload() {
    const next = this.state.queue[0];
    if (!next) return;
    if (!this.state.duration) return;
    const remaining = this.state.duration - this.state.position;
    if (remaining > PRELOAD_TRIGGER_REMAINING_SEC) return;

    const key = this.trackKey(next);
    if (this.preload && this.trackKey(this.preload.track) === key) return;
    if (this.preloadInflight === key) return;

    this.preloadInflight = key;
    void (async () => {
      try {
        const url = await this.resolveUrl(next);
        // Bail if the queue head moved while we were resolving.
        if (this.state.queue[0] && this.trackKey(this.state.queue[0]) !== key) return;
        const a = new Audio();
        a.preload = "auto";
        a.volume = this.audio.volume;
        a.src = url;
        // Touch load() to nudge browsers that haven't started buffering yet.
        a.load();
        this.preload = { track: next, audio: a, url };
      } catch {
        // Preload is best-effort; ignore failures.
      } finally {
        if (this.preloadInflight === key) this.preloadInflight = null;
      }
    })();
  }

  private discardPreload() {
    if (!this.preload) return;
    const a = this.preload.audio;
    a.pause();
    a.src = "";
    this.preload = null;
  }
}

export const player = new Player();
