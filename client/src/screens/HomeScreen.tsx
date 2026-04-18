import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Sidebar } from "./Sidebar";
import { SearchView } from "./SearchView";
import { PlaylistView } from "./PlaylistView";
import { FriendsView } from "./FriendsView";
import { JamView } from "./JamView";
import { PlayerBar } from "./PlayerBar";
import { onNavigate, navigate, type View } from "../nav";
import { startJam, leaveJam } from "../jam/session";
import { useJam } from "../jam/useJam";
import { UpdatePrompt } from "../UpdatePrompt";

export function HomeScreen() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: "search" });
  const [refreshKey, setRefreshKey] = useState(0);
  const jam = useJam();

  useEffect(() => onNavigate(setView), []);

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  async function onStartJam() {
    try {
      const id = await startJam();
      navigate({ kind: "jam", roomId: id });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="app-shell">
      <header>
        <h1>jamapp</h1>
        <div>
          <UpdatePrompt />
          {jam ? (
            <button
              onClick={() => navigate({ kind: "jam", roomId: jam.roomId })}
              title="Go to jam"
            >
              In jam
            </button>
          ) : (
            <button onClick={onStartJam}>Start jam</button>
          )}
          <span>@{user?.username}</span>
          <button
            onClick={() => {
              leaveJam();
              logout();
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <div className="body">
        <Sidebar
          view={view}
          onView={setView}
          refreshKey={refreshKey}
          onChange={bumpRefresh}
        />
        {view.kind === "search" && (
          <SearchView onPlaylistChange={bumpRefresh} />
        )}
        {view.kind === "friends" && <FriendsView />}
        {view.kind === "playlist" && (
          <PlaylistView playlistId={view.id} onChange={bumpRefresh} />
        )}
        {view.kind === "jam" && <JamView roomId={view.roomId} />}
      </div>
      <PlayerBar />
    </div>
  );
}
