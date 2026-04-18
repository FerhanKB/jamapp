import { useEffect, useState } from "react";
import {
  getPlaylist,
  removeTrack,
  renamePlaylist,
  type Playlist,
} from "../api/playlists";
import { player } from "../player/player";
import { copyShareLink } from "../share";
import { inJam, requestAddToQueue } from "../jam/session";

interface Props {
  playlistId: string;
  onChange: () => void;
}

export function PlaylistView({ playlistId, onChange }: Props) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");

  async function refresh() {
    const p = await getPlaylist(playlistId);
    setPlaylist(p);
    setName(p.name);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, [playlistId]);

  async function onRename() {
    if (!playlist || name.trim() === playlist.name) {
      setEditingName(false);
      return;
    }
    await renamePlaylist(playlist.id, name.trim());
    setEditingName(false);
    await refresh();
    onChange();
  }

  async function onRemove(pos: number) {
    await removeTrack(playlistId, pos);
    await refresh();
  }

  if (!playlist) return <div className="main">Loading…</div>;

  return (
    <div className="main">
      <div className="playlist-header">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onBlur={onRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename();
              if (e.key === "Escape") {
                setName(playlist.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <h2 onClick={() => setEditingName(true)} title="Click to rename">
            {playlist.name}
          </h2>
        )}
        <span className="count">
          {playlist.tracks?.length ?? 0} track
          {playlist.tracks?.length === 1 ? "" : "s"}
        </span>
        <div className="row-actions" style={{ marginLeft: "auto" }}>
          <button
            onClick={() => {
              if (playlist.tracks && playlist.tracks.length > 0) {
                void player.playFromList(playlist.tracks, 0);
              }
            }}
            disabled={!playlist.tracks || playlist.tracks.length === 0}
          >
            Play all
          </button>
          <button
            onClick={() => {
              if (playlist.tracks && playlist.tracks.length > 0) {
                player.enqueueMany(playlist.tracks);
              }
            }}
            disabled={!playlist.tracks || playlist.tracks.length === 0}
          >
            Add to queue
          </button>
          <button
            onClick={() => copyShareLink({ kind: "playlist", id: playlist.id })}
          >
            Share
          </button>
        </div>
      </div>
      <ul className="results">
        {playlist.tracks?.map((t, i) => (
          <li key={`${t.source}:${t.source_id}:${i}`}>
            <img src={t.cover} alt="" />
            <div className="meta">
              <strong>{t.title}</strong>
              <span>{t.artist}</span>
            </div>
            <div className="row-actions">
              <button
                onClick={() => {
                  if (inJam()) requestAddToQueue(t);
                  else void player.playFromList(playlist.tracks!, i);
                }}
                title={inJam() ? "Add to jam queue" : "Play from here"}
              >
                {inJam() ? "Add" : "Play"}
              </button>
              <button
                onClick={() => {
                  if (inJam()) requestAddToQueue(t);
                  else player.enqueue(t);
                }}
                title="Add to queue"
              >
                +Q
              </button>
              <button
                onClick={() =>
                  copyShareLink({
                    kind: "track",
                    source: t.source,
                    id: t.source_id,
                  })
                }
                title="Copy share link"
              >
                Share
              </button>
              <button onClick={() => onRemove(i)} title="Remove">
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      {playlist.tracks?.length === 0 && (
        <p className="hint">Empty playlist. Search for songs and click + to add them here.</p>
      )}
    </div>
  );
}
