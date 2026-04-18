# Releasing

## Client (desktop app)

Builds run in GitHub Actions for Linux (`.AppImage`, `.deb`) and Windows (`.msi`/NSIS `.exe`). Releases are triggered by pushing a git tag matching `v*`.

### One-time setup (you already did this, keep as reference)

1. Private signing key generated at `~/.jamapp-updater.key`. **Never commit it.**
2. Public key embedded in `client/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
3. Add two repository **secrets** in GitHub (`Settings → Secrets and variables → Actions → Secrets`):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.jamapp-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — empty (or the password if you set one)
4. Add one repository **variable** (same page → Variables tab):
   - `VITE_API_URL` — `https://ifkb.dev/jamapp` (the public server URL friends' apps will talk to)

### Cutting a release

1. Bump version in `client/src-tauri/tauri.conf.json` and `client/package.json`.
2. Commit. Tag and push:
   ```
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. GitHub Actions builds artifacts, creates a draft release, uploads signed artifacts, then a second job builds `latest.json` from the signatures and un-drafts the release.
4. Existing installed clients check `https://github.com/FerhanKB/jamapp/releases/latest/download/latest.json` on launch. If the version is newer, the header shows an "Update to X" button.

### Users

- Linux: double-click the `.AppImage`, chmod +x if needed.
- Windows: run the `-setup.exe` (NSIS). On first launch, Windows SmartScreen will warn "Unknown publisher" — click **More info → Run anyway**. Happens once per install.

## Server

The server runs once (at your place) and isn't distributed. Deploy however you like:

```
cd server
docker build -t jamapp-server .
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://... \
  -e JWT_SECRET=... \
  -e YOUTUBE_API_KEY=... \
  jamapp-server
```

When you change server code, rebuild + redeploy — no auto-update for the server.
