import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Track } from "../api/types";
import { addTrack, listPlaylists, type Playlist } from "../api/playlists";
import { player } from "../player/player";
import { copyShareLink } from "../share";

interface Props {
  onPlaylistChange: () => void;
}

export function SearchView({ onPlaylistChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuFor(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ tracks: Track[] }>(
        `/youtube/search?q=${encodeURIComponent(query)}&limit=15`,
      );
      setResults(res.tracks);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "search failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddToPlaylist(playlistId: string, track: Track) {
    await addTrack(playlistId, track);
    setAddMenuFor(null);
    onPlaylistChange();
  }

  async function onShare(track: Track) {
    await copyShareLink({
      kind: "track",
      source: track.source,
      id: track.source_id,
    });
  }

  return (
    <div className="main">
      <form className="search" onSubmit={onSearch}>
        <input
          placeholder="Search YouTube for a song…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Search"}
        </button>
      </form>
      {err && <p className="error">{err}</p>}
      <ul className="results">
        {results.map((t) => {
          const key = `${t.source}:${t.source_id}`;
          return (
            <li key={key}>
              <img src={t.cover} alt="" />
              <div className="meta">
                <strong>{t.title}</strong>
                <span>{t.artist}</span>
              </div>
              <div className="row-actions">
                <button onClick={() => player.play(t)}>Play</button>
                <button onClick={() => player.enqueue(t)} title="Add to queue">
                  +Q
                </button>
                <button onClick={() => onShare(t)} title="Copy share link">
                  Share
                </button>
                <div className="add-wrap">
                  <button
                    onClick={() =>
                      setAddMenuFor(addMenuFor === key ? null : key)
                    }
                    disabled={playlists.length === 0}
                    title={
                      playlists.length === 0
                        ? "Create a playlist first"
                        : "Add to playlist"
                    }
                  >
                    +
                  </button>
                  {addMenuFor === key && (
                    <div className="add-menu" ref={addMenuRef}>
                      {playlists.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => onAddToPlaylist(p.id, t)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
