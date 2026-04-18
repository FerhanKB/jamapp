import { useEffect, useState } from "react";
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  type Playlist,
} from "../api/playlists";
import type { View } from "../nav";

interface Props {
  view: View;
  onView: (v: View) => void;
  refreshKey: number;
  onChange: () => void;
}

export function Sidebar({ view, onView, refreshKey, onChange }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    listPlaylists().then(setPlaylists).catch(() => {});
  }, [refreshKey]);

  async function onCreate() {
    const name = newName.trim();
    if (!name) return;
    const pl = await createPlaylist(name);
    setPlaylists((prev) => [pl, ...prev]);
    setNewName("");
    setCreating(false);
    onView({ kind: "playlist", id: pl.id });
    onChange();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this playlist?")) return;
    await deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (view.kind === "playlist" && view.id === id) onView({ kind: "search" });
    onChange();
  }

  return (
    <aside className="sidebar">
      <button
        className={`nav-item ${view.kind === "search" ? "active" : ""}`}
        onClick={() => onView({ kind: "search" })}
      >
        Search
      </button>
      <button
        className={`nav-item ${view.kind === "friends" ? "active" : ""}`}
        onClick={() => onView({ kind: "friends" })}
      >
        Friends
      </button>
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Playlists</span>
          <button className="plus" onClick={() => setCreating(true)}>
            +
          </button>
        </div>
        {creating && (
          <div className="new-playlist">
            <input
              autoFocus
              placeholder="Playlist name"
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              onBlur={() => {
                if (!newName.trim()) setCreating(false);
              }}
            />
          </div>
        )}
        <ul>
          {playlists.map((p) => (
            <li
              key={p.id}
              className={
                view.kind === "playlist" && view.id === p.id ? "active" : ""
              }
            >
              <button
                className="name"
                onClick={() => onView({ kind: "playlist", id: p.id })}
              >
                {p.name}
              </button>
              <button
                className="del"
                onClick={() => onDelete(p.id)}
                title="Delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
