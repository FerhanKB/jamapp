package db

import (
	"context"
	_ "embed"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/001_init.sql
var migration001 string

//go:embed migrations/002_playlists.sql
var migration002 string

//go:embed migrations/003_friends.sql
var migration003 string

//go:embed migrations/004_jam.sql
var migration004 string

func Connect(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://jamapp:jamapp@localhost:5433/jamapp?sslmode=disable"
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return pool, nil
}

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	migrations := []struct {
		name string
		sql  string
	}{
		{"001_init", migration001},
		{"002_playlists", migration002},
		{"003_friends", migration003},
		{"004_jam", migration004},
	}
	for _, m := range migrations {
		if _, err := pool.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("migration %s: %w", m.name, err)
		}
	}
	return nil
}
