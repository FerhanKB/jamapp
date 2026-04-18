import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { initDeepLinks } from "./deeplinks";
import { navigate } from "./nav";
import { player } from "./player/player";
import { getYouTubeTrack } from "./api/youtube";
import { ToastHost } from "./toast";
import { NotificationsHost } from "./notifications/host";
import "./App.css";

function Root() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!user) return;
    const cleanup = initDeepLinks(async (link) => {
      switch (link.kind) {
        case "track":
          if (link.source === "youtube") {
            try {
              const track = await getYouTubeTrack(link.id);
              navigate({ kind: "search" });
              await player.play(track);
            } catch {
              // ignore invalid id
            }
          }
          break;
        case "playlist":
          navigate({ kind: "playlist", id: link.id });
          break;
        case "jam":
          navigate({ kind: "jam", roomId: link.roomId });
          break;
      }
    });
    return () => {
      void cleanup;
    };
  }, [user]);

  if (loading) return <main className="loading">loading…</main>;
  return user ? <HomeScreen /> : <AuthScreen />;
}

function App() {
  return (
    <AuthProvider>
      <Root />
      <NotificationsHost />
      <ToastHost />
    </AuthProvider>
  );
}

export default App;
