package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/fkb/jamapp/server/internal/auth"
	"github.com/fkb/jamapp/server/internal/db"
	"github.com/fkb/jamapp/server/internal/friends"
	"github.com/fkb/jamapp/server/internal/httpx"
	"github.com/fkb/jamapp/server/internal/jam"
	"github.com/fkb/jamapp/server/internal/notify"
	"github.com/fkb/jamapp/server/internal/playlists"
	"github.com/fkb/jamapp/server/internal/youtube"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	ctx := context.Background()

	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("db migrated")

	ah := &auth.Handler{DB: pool}
	yh := &youtube.Handler{Client: youtube.NewClient()}
	ph := &playlists.Handler{DB: pool}
	fh := &friends.Handler{DB: pool}
	notifyHub := notify.NewHub()
	jamReg := jam.NewRegistry(pool)
	jh := &jam.Handler{DB: pool, Registry: jamReg, Notifier: notifyHub}

	authed := func(fn http.HandlerFunc) http.Handler {
		return auth.Middleware(http.HandlerFunc(fn))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", httpx.Health)
	mux.HandleFunc("POST /auth/signup", ah.Signup)
	mux.HandleFunc("POST /auth/login", ah.Login)
	mux.Handle("GET /auth/me", authed(ah.Me))
	mux.Handle("GET /youtube/search", authed(yh.Search))
	mux.Handle("GET /youtube/tracks/{id}", authed(yh.GetTrack))
	mux.Handle("GET /playlists", authed(ph.List))
	mux.Handle("POST /playlists", authed(ph.Create))
	mux.Handle("GET /playlists/{id}", authed(ph.Get))
	mux.Handle("PATCH /playlists/{id}", authed(ph.Rename))
	mux.Handle("DELETE /playlists/{id}", authed(ph.Delete))
	mux.Handle("POST /playlists/{id}/tracks", authed(ph.AddTrack))
	mux.Handle("DELETE /playlists/{id}/tracks", authed(ph.RemoveTrack))
	mux.Handle("GET /friends", authed(fh.List))
	mux.Handle("POST /friends/invite", authed(fh.Invite))
	mux.Handle("POST /friends/{userId}/accept", authed(fh.Accept))
	mux.Handle("DELETE /friends/{userId}", authed(fh.Remove))
	mux.Handle("POST /jam", authed(jh.Create))
	mux.Handle("GET /jam/{id}", authed(jh.Get))
	mux.Handle("POST /jam/{id}/invite", authed(jh.Invite))
	// WS auths via ?token=… (browser WS can't send Authorization header)
	mux.HandleFunc("GET /jam/{id}/ws", jh.WS)
	mux.HandleFunc("GET /notifications/ws", notifyHub.WS)

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("jamapp server listening on %s", addr)
	if err := http.ListenAndServe(addr, httpx.CORS(mux)); err != nil {
		log.Fatal(err)
	}
}
