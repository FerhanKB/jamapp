# nginx reverse proxy

Exposes the jamapp server at `https://ifkb.dev/jamapp/` via the existing nginx
instance on the host.

## Files

- `jamapp.conf` — the `location /jamapp/ { ... }` block + the required `map` for WebSocket upgrades.

## Setup

### 1. Add the upgrade map (once, globally)

If you don't already have this for your other apps, open `/etc/nginx/nginx.conf`
and add inside the `http { }` block:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

### 2. Add the location block

Open your existing `ifkb.dev` server block (on Arch/CachyOS this is typically
`/etc/nginx/nginx.conf` or a file in `/etc/nginx/conf.d/`). Paste the contents
of `jamapp.conf` inside the existing `server { listen 443 ssl; server_name ifkb.dev; ... }`
block.

### 3. Reload

```sh
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Verify

```sh
curl https://ifkb.dev/jamapp/health
# {"status":"ok"}
```

## Client build

The desktop client bakes the server URL in at build time via `VITE_API_URL`.

For the production Windows build (GH Actions), add a repository secret
`VITE_API_URL=https://ifkb.dev/jamapp` and reference it in the workflow's
`tauri-action` `env` block. The build picks it up and ships an installer that
talks to your public server.

For local dev you don't need to set anything — the default is `http://localhost:8080`.

## What gets proxied

- `GET /health`
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `GET /youtube/search`, `GET /youtube/tracks/{id}`
- `GET|POST|PATCH|DELETE /playlists...`
- `GET /friends`, `POST /friends/invite`, `POST /friends/{id}/accept`, `DELETE /friends/{id}`
- `POST /jam`, `GET /jam/{id}`, `POST /jam/{id}/invite`
- `GET /jam/{id}/ws` — WebSocket, auth via `?token=`
- `GET /notifications/ws` — WebSocket, auth via `?token=`

## Firewall

No change to `iptables`/`ufw` — the jamapp server stays bound to `127.0.0.1:8080`
(only nginx can reach it). Nginx is the only thing exposed on 443.

## Troubleshooting

- **WebSocket stays in connecting state** — you forgot the `map $http_upgrade`
  directive, or you're missing the `proxy_set_header Upgrade/Connection` lines.
- **502 Bad Gateway** — jamapp server isn't running. `systemctl status jamapp`.
- **404 on `/jamapp/health`** — trailing slash mismatch. The `proxy_pass`
  target must end with `/` and the `location` must end with `/` for the prefix
  to strip correctly.
