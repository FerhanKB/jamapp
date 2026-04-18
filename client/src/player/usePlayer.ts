import { useSyncExternalStore } from "react";
import { player } from "./player";

export function usePlayer() {
  const state = useSyncExternalStore(
    (fn) => player.subscribe(fn),
    () => player.getState(),
  );
  return { ...state, player };
}
