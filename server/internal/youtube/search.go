package youtube

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Track struct {
	Source   string `json:"source"`
	SourceID string `json:"source_id"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Cover    string `json:"cover"`
	Duration int    `json:"duration_ms"`
}

type Client struct {
	APIKey string
	HTTP   *http.Client
}

func NewClient() *Client {
	return &Client{
		APIKey: os.Getenv("YOUTUBE_API_KEY"),
		HTTP:   &http.Client{Timeout: 10 * time.Second},
	}
}

type searchResponse struct {
	Items []struct {
		ID struct {
			VideoID string `json:"videoId"`
		} `json:"id"`
		Snippet struct {
			Title        string `json:"title"`
			ChannelTitle string `json:"channelTitle"`
			Thumbnails   struct {
				Medium struct {
					URL string `json:"url"`
				} `json:"medium"`
				High struct {
					URL string `json:"url"`
				} `json:"high"`
			} `json:"thumbnails"`
		} `json:"snippet"`
	} `json:"items"`
}

type videosResponse struct {
	Items []struct {
		ID             string `json:"id"`
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
		Snippet struct {
			Title        string `json:"title"`
			ChannelTitle string `json:"channelTitle"`
			Thumbnails   struct {
				Medium struct {
					URL string `json:"url"`
				} `json:"medium"`
				High struct {
					URL string `json:"url"`
				} `json:"high"`
			} `json:"thumbnails"`
		} `json:"snippet"`
	} `json:"items"`
}

func (c *Client) Search(ctx context.Context, q string, limit int) ([]Track, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("YOUTUBE_API_KEY not set")
	}
	if limit <= 0 || limit > 25 {
		limit = 10
	}

	params := url.Values{}
	params.Set("part", "snippet")
	params.Set("type", "video")
	params.Set("videoCategoryId", "10") // Music
	params.Set("maxResults", fmt.Sprintf("%d", limit))
	params.Set("q", q)
	params.Set("key", c.APIKey)

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://www.googleapis.com/youtube/v3/search?"+params.Encode(), nil)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("youtube search: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("youtube search: status %d", resp.StatusCode)
	}

	var sr searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, fmt.Errorf("decode search: %w", err)
	}

	ids := make([]string, 0, len(sr.Items))
	tracks := make([]Track, 0, len(sr.Items))
	for _, it := range sr.Items {
		if it.ID.VideoID == "" {
			continue
		}
		ids = append(ids, it.ID.VideoID)
		cover := it.Snippet.Thumbnails.High.URL
		if cover == "" {
			cover = it.Snippet.Thumbnails.Medium.URL
		}
		tracks = append(tracks, Track{
			Source:   "youtube",
			SourceID: it.ID.VideoID,
			Title:    it.Snippet.Title,
			Artist:   it.Snippet.ChannelTitle,
			Cover:    cover,
		})
	}

	if len(ids) > 0 {
		if durations, err := c.fetchDurations(ctx, ids); err == nil {
			for i := range tracks {
				if d, ok := durations[tracks[i].SourceID]; ok {
					tracks[i].Duration = d
				}
			}
		}
	}
	return tracks, nil
}

func (c *Client) fetchDurations(ctx context.Context, ids []string) (map[string]int, error) {
	vr, err := c.fetchVideos(ctx, ids, "contentDetails")
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(vr.Items))
	for _, it := range vr.Items {
		out[it.ID] = parseISODuration(it.ContentDetails.Duration)
	}
	return out, nil
}

func (c *Client) fetchVideos(ctx context.Context, ids []string, parts string) (*videosResponse, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("YOUTUBE_API_KEY not set")
	}
	params := url.Values{}
	params.Set("part", parts)
	params.Set("id", strings.Join(ids, ","))
	params.Set("key", c.APIKey)

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://www.googleapis.com/youtube/v3/videos?"+params.Encode(), nil)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("videos status %d", resp.StatusCode)
	}
	var vr videosResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return nil, err
	}
	return &vr, nil
}

// GetTrack fetches a single YouTube video as a Track.
func (c *Client) GetTrack(ctx context.Context, id string) (*Track, error) {
	vr, err := c.fetchVideos(ctx, []string{id}, "snippet,contentDetails")
	if err != nil {
		return nil, err
	}
	if len(vr.Items) == 0 {
		return nil, fmt.Errorf("video not found")
	}
	it := vr.Items[0]
	cover := it.Snippet.Thumbnails.High.URL
	if cover == "" {
		cover = it.Snippet.Thumbnails.Medium.URL
	}
	return &Track{
		Source:   "youtube",
		SourceID: it.ID,
		Title:    it.Snippet.Title,
		Artist:   it.Snippet.ChannelTitle,
		Cover:    cover,
		Duration: parseISODuration(it.ContentDetails.Duration),
	}, nil
}

// parseISODuration parses ISO-8601 durations like "PT4M13S" to milliseconds.
func parseISODuration(s string) int {
	if !strings.HasPrefix(s, "PT") {
		return 0
	}
	s = s[2:]
	var ms, num int
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			num = num*10 + int(r-'0')
		case r == 'H':
			ms += num * 3600000
			num = 0
		case r == 'M':
			ms += num * 60000
			num = 0
		case r == 'S':
			ms += num * 1000
			num = 0
		}
	}
	return ms
}
