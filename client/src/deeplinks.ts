import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";

export type DeepLink =
  | { kind: "track"; source: string; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "jam"; roomId: string };

export function parseDeepLink(raw: string): DeepLink | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "jamapp:") return null;
    // jamapp://track/youtube/xyz -> host="track", pathname="/youtube/xyz"
    const segments = [url.host, ...url.pathname.split("/").filter(Boolean)];
    if (segments[0] === "track" && segments.length >= 3) {
      return { kind: "track", source: segments[1], id: segments[2] };
    }
    if (segments[0] === "playlist" && segments.length >= 2) {
      return { kind: "playlist", id: segments[1] };
    }
    if (segments[0] === "jam" && segments.length >= 2) {
      return { kind: "jam", roomId: segments[1] };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildShareUrl(link: DeepLink): string {
  switch (link.kind) {
    case "track":
      return `jamapp://track/${link.source}/${link.id}`;
    case "playlist":
      return `jamapp://playlist/${link.id}`;
    case "jam":
      return `jamapp://jam/${link.roomId}`;
  }
}

export async function initDeepLinks(handler: (link: DeepLink) => void) {
  // URLs that launched the app (if any)
  try {
    const initial = await getCurrent();
    if (initial) {
      for (const raw of initial) {
        const parsed = parseDeepLink(raw);
        if (parsed) handler(parsed);
      }
    }
  } catch {
    // ignore — may not be available on all platforms
  }
  // URLs that arrive while the app is running
  await onOpenUrl((urls) => {
    for (const raw of urls) {
      const parsed = parseDeepLink(raw);
      if (parsed) handler(parsed);
    }
  });
}
