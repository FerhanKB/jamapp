import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  acceptFriend,
  getFriends,
  inviteFriend,
  removeFriend,
  type FriendsResponse,
} from "../api/friends";
import {
  getPresence,
  presenceVersion,
  seedPresence,
  subscribePresence,
} from "../presence";
import { joinJam } from "../jam/session";
import { navigate } from "../nav";

function usePresenceTick() {
  return useSyncExternalStore(subscribePresence, presenceVersion);
}

export function FriendsView() {
  const [data, setData] = useState<FriendsResponse>({
    friends: [],
    pending: [],
  });
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePresenceTick();

  async function refresh() {
    try {
      const res = await getFriends();
      setData(res);
      seedPresence(res.friends);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    const uname = username.trim();
    if (!uname) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await inviteFriend(uname);
      setMsg(
        res.status === "accepted"
          ? `You and @${uname} are now friends`
          : `Invite sent to @${uname}`,
      );
      setUsername("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(userId: string) {
    await acceptFriend(userId);
    await refresh();
  }

  async function onRemove(userId: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    await removeFriend(userId);
    await refresh();
  }

  async function onJoinFriendJam(roomId: string) {
    await joinJam(roomId);
    navigate({ kind: "jam", roomId });
  }

  const incoming = data.pending.filter((p) => p.direction === "incoming");
  const outgoing = data.pending.filter((p) => p.direction === "outgoing");

  return (
    <div className="main">
      <h2>Friends</h2>
      <form className="invite-form" onSubmit={onInvite}>
        <input
          placeholder="Invite by username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Invite"}
        </button>
      </form>
      {msg && <p className="hint">{msg}</p>}
      {err && <p className="error">{err}</p>}

      {incoming.length > 0 && (
        <section>
          <h3>Incoming requests</h3>
          <ul className="friends-list">
            {incoming.map((f) => (
              <li key={f.user_id}>
                <span>@{f.username}</span>
                <div className="row-actions">
                  <button onClick={() => onAccept(f.user_id)}>Accept</button>
                  <button
                    onClick={() =>
                      onRemove(f.user_id, `Decline request from @${f.username}?`)
                    }
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3>Sent</h3>
          <ul className="friends-list">
            {outgoing.map((f) => (
              <li key={f.user_id}>
                <span>@{f.username}</span>
                <div className="row-actions">
                  <span className="hint">pending</span>
                  <button
                    onClick={() =>
                      onRemove(f.user_id, `Cancel invite to @${f.username}?`)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Friends ({data.friends.length})</h3>
        {data.friends.length === 0 ? (
          <p className="hint">
            No friends yet. Invite someone by their jamapp username.
          </p>
        ) : (
          <ul className="friends-list">
            {data.friends.map((f) => {
              const p = getPresence(f.user_id);
              return (
                <li key={f.user_id}>
                  <span className="friend-label">
                    <span
                      className={`presence-dot ${p.online ? "on" : "off"}`}
                      title={p.online ? "online" : "offline"}
                    />
                    @{f.username}
                    {p.jamRoomId && (
                      <span className="in-jam-badge">in a jam</span>
                    )}
                  </span>
                  <div className="row-actions">
                    {p.jamRoomId && (
                      <button
                        onClick={() => onJoinFriendJam(p.jamRoomId!)}
                        className="join-btn"
                      >
                        Join
                      </button>
                    )}
                    <button
                      onClick={() =>
                        onRemove(f.user_id, `Unfriend @${f.username}?`)
                      }
                    >
                      Unfriend
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
