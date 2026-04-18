package playlists

import (
	"fmt"
	"net/http"
	"strconv"
)

func readIntQuery(r *http.Request, key string, out *int) (bool, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return false, fmt.Errorf("%s required", key)
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return false, fmt.Errorf("%s must be integer", key)
	}
	*out = n
	return true, nil
}
