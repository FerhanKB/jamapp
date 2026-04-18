package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type ctxKey struct{}

func UserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(ctxKey{}).(uuid.UUID)
	return id, ok
}

func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		claims, err := ParseToken(strings.TrimPrefix(h, "Bearer "))
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
