-- Friend requests: one row per direction, canonicalized on accept.
-- status: pending | accepted
-- On accept, we keep the single row; queries normalize via OR on both columns.
CREATE TABLE IF NOT EXISTS friendships (
    from_user  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    PRIMARY KEY (from_user, to_user),
    CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS friendships_to_idx ON friendships(to_user);
