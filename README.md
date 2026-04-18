# jamapp

Personal music-streaming desktop app with synchronized listening ("jam") sessions.
Sources: Spotify (Premium required) and YouTube (via yt-dlp).

## Layout

- `client/` — Tauri + React + TypeScript desktop app
- `server/` — Go backend (auth, friends, playlists, jam sync)
- `docker-compose.yml` — Postgres for local dev

## Dev

```sh
# 1. Start Postgres
docker compose up -d

# 2. Run server
cd server && go run ./cmd/server
# -> http://localhost:8080/health

# 3. Run client
cd client && npm install && npm run tauri dev
```

### Linux prerequisites for Tauri

Install `webkit2gtk`, `libappindicator`, `librsvg`, build tools.
On Arch/CachyOS: `sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3 librsvg base-devel`.
