import { useEffect, useRef, useState } from "react";
import { useJam } from "../jam/useJam";
import { joinJam, leaveJam } from "../jam/session";
import { copyShareLink } from "../share";
import { navigate } from "../nav";
import { usePlayer } from "../player/usePlayer";
import { getFriends, type Friend } from "../api/friends";
import { inviteToJam } from "../api/jam";

interface Props {
  roomId: string;
}

export function JamView({ roomId }: Props) {
  const jam = useJam();
  const { track } = usePlayer();
  const [err, setErr] = useState<string | null>(null);
  const [friends, setFriendsState] = useState<Friend[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jam || jam.roomId !== roomId) {
      joinJam(roomId).catch((e) =>
        setErr(e instanceof Error ? e.message : "join failed"),
      );
    }
  }, [roomId, jam?.roomId]);

  useEffect(() => {
    getFriends()
      .then((r) => setFriendsState(r.friends))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [menuOpen]);

  const isHost = jam?.hostId && jam.youId && jam.hostId === jam.youId;
  const memberIds = new Set(jam?.members.map((m) => m.user_id) ?? []);

  async function onInvite(friend: Friend) {
    setInviting(friend.user_id);
    try {
      await inviteToJam(roomId, friend.user_id);
      setInvited((prev) => new Set(prev).add(friend.user_id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "invite failed");
    } finally {
      setInviting(null);
    }
  }

  function onLeave() {
    leaveJam();
    navigate({ kind: "search" });
  }

  const inviteableFriends = friends.filter((f) => !memberIds.has(f.user_id));

  return (
    <div className="main">
      <div className="jam-header">
        <h2>Jam</h2>
        <div className="row-actions">
          <div className="add-wrap" ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)}>
              Invite friends
            </button>
            {menuOpen && (
              <div className="add-menu invite-menu">
                {inviteableFriends.length === 0 ? (
                  <span className="hint" style={{ padding: "0.5rem 0.75rem" }}>
                    {friends.length === 0
                      ? "No friends yet"
                      : "All friends are here"}
                  </span>
                ) : (
                  inviteableFriends.map((f) => (
                    <button
                      key={f.user_id}
                      onClick={() => onInvite(f)}
                      disabled={inviting === f.user_id || invited.has(f.user_id)}
                    >
                      @{f.username}
                      {invited.has(f.user_id)
                        ? " · sent"
                        : inviting === f.user_id
                          ? " · …"
                          : ""}
                    </button>
                  ))
                )}
                <div
                  style={{
                    borderTop: "1px solid #333",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  <button
                    className="link"
                    onClick={() => {
                      void copyShareLink({ kind: "jam", roomId });
                      setMenuOpen(false);
                    }}
                  >
                    Copy link instead
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={onLeave}>Leave</button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {!jam && !err && <p className="hint">Connecting…</p>}
      {jam && (
        <>
          <p className="hint">
            {isHost
              ? "You are the host. Your playback controls drive the room."
              : "Follow mode: the host controls playback."}
            {" · "}
            {jam.connected ? "Connected" : "Disconnected"}
          </p>
          <section>
            <h3>In the room ({jam.members.length})</h3>
            <ul className="friends-list">
              {jam.members.map((m) => (
                <li key={m.user_id}>
                  <span>
                    @{m.username}
                    {m.user_id === jam.hostId ? " · host" : ""}
                    {m.user_id === jam.youId ? " · you" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {track && (
            <section>
              <h3>Now playing</h3>
              <div className="jam-now">
                <img src={track.cover} alt="" />
                <div>
                  <strong>{track.title}</strong>
                  <br />
                  <span className="hint">{track.artist}</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
