import { api } from "./client";
import type { Track } from "./types";

export function getYouTubeTrack(id: string): Promise<Track> {
  return api<Track>(`/youtube/tracks/${id}`);
}
