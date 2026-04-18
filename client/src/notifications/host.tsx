import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  connectNotifications,
  disconnectNotifications,
  type JamInvite,
} from "./client";
import { joinJam } from "../jam/session";
import { navigate } from "../nav";

interface Prompt {
  id: number;
  invite: JamInvite;
}

export function NotificationsHost() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    if (!user) {
      disconnectNotifications();
      return;
    }
    let next = 0;
    connectNotifications((type, payload) => {
      if (type === "jam_invite") {
        const invite = payload as JamInvite;
        const id = next++;
        setPrompts((prev) => [...prev, { id, invite }]);
      }
    });
    return () => disconnectNotifications();
  }, [user]);

  function dismiss(id: number) {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }

  async function accept(p: Prompt) {
    dismiss(p.id);
    try {
      await joinJam(p.invite.room_id);
      navigate({ kind: "jam", roomId: p.invite.room_id });
    } catch {
      // ignore
    }
  }

  if (prompts.length === 0) return null;
  return (
    <div className="invite-host">
      {prompts.map((p) => (
        <div key={p.id} className="invite-prompt">
          <span>
            <strong>@{p.invite.from_username}</strong> invited you to a jam
          </span>
          <div className="row-actions">
            <button onClick={() => accept(p)}>Join</button>
            <button onClick={() => dismiss(p.id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
