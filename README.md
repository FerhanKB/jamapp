# jamapp

Personal music-streaming desktop app with synchronized listening ("jam") sessions,
playlists, and friends. Sources: YouTube (via yt-dlp) and Spotify (planned).

## For users — just install the app

Download the latest build for your OS from the [Releases page](https://github.com/FerhanKB/jamapp/releases/latest):

- **Linux (any distro)** — `jamapp_*_amd64.AppImage`
  ```sh
  chmod +x jamapp_*_amd64.AppImage
  ./jamapp_*_amd64.AppImage
  ```

- **Windows** — `jamapp_*_x64-setup.exe`. Double-click to install.
  First launch shows a SmartScreen warning ("Unknown publisher") — click
  **More info → Run anyway**. Happens once.

The app auto-downloads `yt-dlp` on first use if it's not already installed.

The app checks for updates on launch; when one's available, a green
"Update to X" button appears in the header — one click upgrades and relaunches.

Ask the host for the server URL on first sign-in.

---

## For the person running the server (host)

The server is what ties friends together — auth, friends list, playlists, jam
sync. Run one instance; everyone points their app at it.

### Quick start

```sh
git clone https://github.com/FerhanKB/jamapp.git
cd jamapp
cp server/.env.example server/.env       # fill in YOUTUBE_API_KEY + JWT_SECRET
docker compose up -d
curl http://localhost:8080/health         # {"status":"ok"}
```

### Run at boot on Linux

```sh
sudo cp deploy/jamapp.service /etc/systemd/system/jamapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now jamapp.service
```

Full docs: [`deploy/README.md`](deploy/README.md).

### Updating

```sh
git pull
sudo systemctl restart jamapp     # rebuilds & redeploys
```

---

## For contributors — local dev

### Prerequisites

- Go ≥ 1.26
- Node ≥ 20
- Rust (for Tauri)
- Docker (for Postgres)
- `yt-dlp` in `PATH`

Linux extras (Tauri needs these):
```sh
# Arch/CachyOS
sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3 librsvg base-devel \
               gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
```

### Run

```sh
# 1. Start Postgres
docker compose up -d db

# 2. Server
cd server
cp .env.example .env    # edit to add YOUTUBE_API_KEY
go run ./cmd/server

# 3. Client (new terminal)
cd client
npm install
npm run tauri dev
```

### Layout

- `client/` — Tauri + React + TypeScript desktop app
- `server/` — Go backend
- `docker-compose.yml` — Postgres + server for production
- `deploy/` — systemd unit + deployment docs
- `docs/` — misc notes (GitHub push setup, etc.)

---

## Releases

Tag a release to trigger cross-platform builds:

```sh
# bump version in client/src-tauri/tauri.conf.json + client/package.json first
git tag v0.2.0
git push origin v0.2.0
```

Full process: [`RELEASING.md`](RELEASING.md).

## License

Personal project — no license.
