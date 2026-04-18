# Changelog

All notable user-facing changes. Entries under `## [Unreleased]` ship with the next tag.

## [Unreleased]

## [0.2.0] — 2026-04-18

### Added
- **Auto-installs yt-dlp** on first play when it's not already on `PATH`. No manual install required on any platform.
- **Friends list now shows online status** (green dot) and an "in a jam" badge with a one-click **Join** button when a friend is in a room.
- **Shared jam queue** — any guest can add tracks (`+Q`) and the host's queue updates for everyone.
- **Guests can skip** the current track (⏭ in the bottom bar forwards to the host).

### Changed
- Search and playlist rows show **Add** instead of Play while you're in a jam, to reflect that the action goes to the shared queue.
- Windows/Linux release builds now point at `https://ifkb.dev/jamapp` by default (baked in at build time via `VITE_API_URL`).

### Fixed
- Duplicate member appearing in a jam room when reconnecting.

## [0.1.0] — 2026-04-18

Initial release.

### Features
- Username/password signup & login (JWT).
- YouTube search + playback via yt-dlp.
- Playlist CRUD, add/remove/reorder tracks.
- Friends: invite by username, accept/decline, unfriend.
- Synchronized jam rooms with host-authoritative playback (play/pause/seek follow the host).
- In-app jam invites to friends + invite-link fallback.
- Custom `jamapp://` deep links (track, playlist, jam).
- In-app auto-updater (signed, ed25519).
- Single-instance handling so external links focus the existing window.
