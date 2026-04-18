import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Listener = (u: Update | null) => void;

let available: Update | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn(available));
}

export function subscribeUpdater(fn: Listener): () => void {
  listeners.add(fn);
  fn(available);
  return () => {
    listeners.delete(fn);
  };
}

export async function checkForUpdates() {
  try {
    const update = await check();
    if (update?.available) {
      available = update;
      notify();
    }
  } catch {
    // silently ignore — offline, endpoint unavailable, dev build, etc.
  }
}

export async function applyUpdate(): Promise<void> {
  if (!available) return;
  await available.downloadAndInstall();
  await relaunch();
}
