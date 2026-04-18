# Running jamapp server on boot (Linux + systemd)

The server + Postgres run via `docker compose`. A systemd unit starts them at boot and rebuilds on restart so code changes pick up automatically.

## One-time install

```bash
sudo cp deploy/jamapp.service /etc/systemd/system/jamapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now jamapp.service
```

Check it:
```bash
systemctl status jamapp
curl http://localhost:8080/health
```

## Applying code changes

Pull + restart — systemd's `ExecStart` runs `docker compose up -d --build`, so restarting the unit rebuilds and replaces the containers:

```bash
cd ~/dev/personal/music-streaming
git pull
sudo systemctl restart jamapp
```

## Logs

```bash
# systemd unit (start/stop events)
journalctl -u jamapp -f

# container logs
docker compose -f ~/dev/personal/music-streaming/docker-compose.yml logs -f server
```

## Stop it

```bash
sudo systemctl stop jamapp            # stop now, but come back at next boot
sudo systemctl disable --now jamapp   # stop now and stay stopped
```

## Notes

- The unit runs `docker compose up -d --build` — first boot after a fresh checkout can take a minute while Go compiles. Subsequent restarts are fast.
- `WorkingDirectory` is hardcoded to `/home/fkb/dev/personal/music-streaming`. If you move the repo, edit the unit file and `systemctl daemon-reload`.
- Postgres data lives in the `pgdata` Docker volume and survives restarts. To reset: `docker compose down -v` (destroys data).
- `server/.env` contains secrets (DB password doesn't matter much in compose, but `YOUTUBE_API_KEY` and `JWT_SECRET` do). It's gitignored; don't commit.
