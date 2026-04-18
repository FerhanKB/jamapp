CREATE TABLE IF NOT EXISTS playlists (
    id         UUID PRIMARY KEY,
    owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playlists_owner_idx ON playlists(owner_id);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    position    INT  NOT NULL,
    source      TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    cover       TEXT NOT NULL,
    duration_ms INT  NOT NULL DEFAULT 0,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id, position)
);
