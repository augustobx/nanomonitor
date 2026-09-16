package scheduler

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/buffer"
	"github.com/nanolabs/nanomonitor/agent/internal/collector"
	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

func TestOfflineBufferDrainAndPoisonPillHandling(t *testing.T) {
	// 1. Mock server that can be toggled UP/DOWN/POISON
	var isOffline atomic.Bool
	isOffline.Store(true) // Start simulated offline (503 Service Unavailable)

	var mu sync.Mutex
	deliveredEndpoints := make([]string, 0)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isOffline.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error": "offline"}`))
			return
		}

		body, _ := io.ReadAll(r.Body)

		// If this is the poison pill payload, return 400 Bad Request
		if strings.Contains(string(body), `"poison":true`) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error": "bad request poison"}`))
			return
		}

		mu.Lock()
		deliveredEndpoints = append(deliveredEndpoints, r.URL.Path)
		mu.Unlock()

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status": "ok"}`))
	}))
	defer server.Close()

	// 2. Setup temporary buffer DB
	tmpDir, err := os.MkdirTemp("", "buffer-drain-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "buffer.json")
	buf, err := buffer.NewPriorityBuffer(dbPath, 1024*1024)
	if err != nil {
		t.Fatalf("NewPriorityBuffer: %v", err)
	}

	// 3. Create client pointing to test server
	rawLogger := slog.New(slog.NewTextHandler(io.Discard, nil))
	client := transport.NewClient(server.URL, "test-agent-id", "secret-test-key", rawLogger)

	cfg := &config.Config{
		APIUrl:          server.URL,
		BufferDBPath:    dbPath,
		BufferMaxSizeMB: 10,
	}

	s := &Scheduler{
		cfg:    cfg,
		client: client,
		buffer: buf,
		logger: rawLogger,
	}

	// 4. Enqueue telemetry items while "offline"
	_ = buf.Enqueue(buffer.PriorityMetrics, "/agent/metrics", map[string]interface{}{"cpuPercent": 42.5})
	_ = buf.Enqueue(buffer.PriorityHeartbeat, "/agent/heartbeat", transport.HeartbeatPayload{AgentVersion: "1.0.0", Status: "ONLINE"})
	_ = buf.Enqueue(buffer.PrioritySecurity, "/agent/events", []collector.DeviceEventPayload{
		{Title: "Security State Changed", Severity: "CRITICAL", Category: "Security", Timestamp: time.Now().UTC()},
	})
	_ = buf.Enqueue(buffer.PriorityAlert, "/agent/metrics", map[string]bool{"poison": true}) // poison pill item sent to metrics

	if buf.Len() != 4 {
		t.Fatalf("expected 4 buffered items, got %d", buf.Len())
	}

	// 5. Test drain while OFFLINE: buffer should remain intact
	ctx := context.Background()
	s.flushOfflineBuffer(ctx)

	if buf.Len() != 4 {
		t.Fatalf("buffer should not have drained while offline, items remaining: %d", buf.Len())
	}

	// 6. Restore connectivity (simulate network reconnection)
	isOffline.Store(false)

	// Drain again: should deliver items in priority order and discard poison pill
	s.flushOfflineBuffer(ctx)

	if buf.Len() != 0 {
		t.Fatalf("expected buffer to be completely empty after drain, got %d items remaining", buf.Len())
	}

	// 7. Verify delivery order: Priority 1 (/agent/events Security) MUST precede Priority 4 (/agent/heartbeat) and Priority 5 (/agent/metrics)
	mu.Lock()
	defer mu.Unlock()

	if len(deliveredEndpoints) != 3 {
		t.Fatalf("expected 3 delivered endpoints (Security, Heartbeat, Metrics), got %d: %v", len(deliveredEndpoints), deliveredEndpoints)
	}

	if deliveredEndpoints[0] != "/agent/events" {
		t.Errorf("expected first delivered item to be /agent/events (Priority 1), got %s", deliveredEndpoints[0])
	}
	if deliveredEndpoints[1] != "/agent/heartbeat" {
		t.Errorf("expected second delivered item to be /agent/heartbeat (Priority 4), got %s", deliveredEndpoints[1])
	}
	if deliveredEndpoints[2] != "/agent/metrics" {
		t.Errorf("expected third delivered item to be /agent/metrics (Priority 5), got %s", deliveredEndpoints[2])
	}

	t.Log("[PASS] Offline buffer successfully held data while disconnected, prioritized transmission upon reconnection, and safely evicted poison pill!")
}
