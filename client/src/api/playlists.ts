import { api } from "./client";
import type { Track } from "./types";

export interface Playlist {
  id: string;
  owner_id: string;
  name: string;
  tracks?: Track[];
}

export async function listPlaylists(): Promise<Playlist[]> {
  const res = await api<{ playlists: Playlist[] }>("/playlists");
  return res.playlists;
}

export function createPlaylist(name: string): Promise<Playlist> {
  return api<Playlist>("/playlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getPlaylist(id: string): Promise<Playlist> {
  return api<Playlist>(`/playlists/${id}`);
}

export function renamePlaylist(id: string, name: string): Promise<void> {
  return api<void>(`/playlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deletePlaylist(id: string): Promise<void> {
  return api<void>(`/playlists/${id}`, { method: "DELETE" });
}

export function addTrack(
  playlistId: string,
  track: Track,
): Promise<{ position: number }> {
  return api<{ position: number }>(`/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: JSON.stringify(track),
  });
}

export function removeTrack(
  playlistId: string,
  position: number,
): Promise<void> {
  return api<void>(
    `/playlists/${playlistId}/tracks?position=${position}`,
    { method: "DELETE" },
  );
}
