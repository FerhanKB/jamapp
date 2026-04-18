CREATE TABLE IF NOT EXISTS jam_rooms (
    id         UUID PRIMARY KEY,
    host_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
