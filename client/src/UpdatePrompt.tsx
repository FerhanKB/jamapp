import { useEffect, useState } from "react";
import { applyUpdate, checkForUpdates, subscribeUpdater } from "./updater";
import type { Update } from "@tauri-apps/plugin-updater";

export function UpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const unsub = subscribeUpdater(setUpdate);
    void checkForUpdates();
    const poll = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, []);

  if (!update) return null;

  async function onUpdate() {
    setApplying(true);
    try {
      await applyUpdate();
    } catch {
      setApplying(false);
    }
  }

  return (
    <button
      className="update-prompt"
      onClick={onUpdate}
      disabled={applying}
      title={`Update to ${update.version}`}
    >
      {applying ? "Updating…" : `Update to ${update.version}`}
    </button>
  );
}
