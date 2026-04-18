export type View =
  | { kind: "search" }
  | { kind: "friends" }
  | { kind: "playlist"; id: string }
  | { kind: "jam"; roomId: string };

type Listener = (view: View) => void;

const listeners = new Set<Listener>();

export function navigate(view: View) {
  listeners.forEach((fn) => fn(view));
}

export function onNavigate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
