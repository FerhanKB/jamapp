import { useSyncExternalStore } from "react";
import { getJamState, subscribeJam } from "./session";

export function useJam() {
  return useSyncExternalStore(
    (fn) => subscribeJam(fn),
    () => getJamState(),
  );
}
