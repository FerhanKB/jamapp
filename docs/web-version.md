# Web version (future work)

A browser-accessible version of jamapp at `https://ifkb.dev/jamapp`. Same server, same DB, same accounts — friends visit a URL and listen, no install.

## Why

- Zero install friction — covers friends who hit the AppImage Nvidia bug or don't want to download an app.
- Complements the desktop app, doesn't replace it.
- Reuses ~90% of the React code already written.

## Scope

Roughly half a day. Main pieces:

### Server changes
- New endpoint `GET /youtube/audio/{id}` that shells out to `yt-dlp -f bestaudio -g` on the server and returns the resolved googlevideo URL (with a short in-memory cache, say 5 min, since URLs expire in ~6h anyway).
  - **Load implication**: the server now does the scraping the Tauri client was doing. Audio itself still streams browser ↔ googlevideo directly, so server bandwidth stays zero.
- CORS headers tightened to allow only `https://ifkb.dev`.

### Client changes
- Abstract the audio-URL resolver: Tauri build uses the existing `invoke("resolve_youtube_audio")` Rust command; web build calls the new server endpoint. Cleanest way: a `src/player/resolver.ts` with two implementations picked at build time via Vite's `import.meta.env.TAURI_ENV_PLATFORM` or a custom `VITE_TARGET` flag.
- React Router for web paths — `/jamapp` shell with routes `/track/:source/:id`, `/playlist/:id`, `/jam/:roomId`. In Tauri we still use the deep-link plugin + in-memory nav bus; in web we use the router.
- Drop clipboard-manager plugin usage in web — browser Clipboard API works directly.
- Handle autoplay policy: pause initial track until first user interaction (trivial flag + "Click to start" state).
- Tauri-only features (system notifications later, tray, etc.) stay behind `if (window.__TAURI__)` guards.

### Build + deploy
- `npm run build:web` → emits `client/dist-web/`. Nginx serves it at `/jamapp/` from the same box the server runs on.
- Existing `npm run tauri build` stays unchanged for desktop.

### nginx config (addition to current setup)

```nginx
# Inside the existing ifkb.dev server { } block, in addition to the /jamapp/ API proxy:
location /jamapp/app/ {
    alias /var/www/jamapp-web/;
    try_files $uri $uri/ /index.html;
}
```

(Or serve the static build on the same prefix as the API if we do proper path-based routing.)

## Non-goals for v1

- No PWA / offline mode.
- No mobile-optimized UI (works on mobile, but desktop-first layout).
- No auto-update mechanism (web is always current — redeploy and users see the new version on refresh).

## When to build it

Trigger for implementation: when more than one friend can't get the AppImage running, or when the first "can I just listen on my phone?" ask shows up.

## Not included in v1 scope

- Push notifications in browser (would need service worker + VAPID keys).
- Native-feeling keyboard shortcuts (browsers eat some of them).
- Spotify Web Playback SDK integration — handled in phase 3 regardless of desktop vs web.
