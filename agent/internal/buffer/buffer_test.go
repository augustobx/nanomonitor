package buffer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPriorityBufferOrdering(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "buffer-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "buffer.json")
	buf, err := NewPriorityBuffer(dbPath, 1024*1024)
	if err != nil {
		t.Fatalf("NewPriorityBuffer: %v", err)
	}

	// Enqueue in arbitrary order
	_ = buf.Enqueue(PriorityMetrics, "/agent/metrics", map[string]string{"type": "metric1"})
	_ = buf.Enqueue(PriorityInventory, "/agent/inventory", map[string]string{"type": "inv1"})
	_ = buf.Enqueue(PrioritySecurity, "/agent/events", map[string]string{"type": "security_transition"})
	_ = buf.Enqueue(PriorityCriticalEvent, "/agent/events", map[string]string{"type": "bsod"})
	_ = buf.Enqueue(PriorityHeartbeat, "/agent/heartbeat", map[string]string{"type": "hb1"})

	items := buf.PeekSorted()
	if len(items) != 5 {
		t.Fatalf("expected 5 items, got %d", len(items))
	}

	// Verify priority ordering: 1 (Security) < 2 (Critical) < 4 (Heartbeat) < 5 (Metrics) < 6 (Inventory)
	if items[0].Priority != PrioritySecurity {
		t.Errorf("expected item[0] to be Security (1), got %d", items[0].Priority)
	}
	if items[1].Priority != PriorityCriticalEvent {
		t.Errorf("expected item[1] to be CriticalEvent (2), got %d", items[1].Priority)
	}
	if items[2].Priority != PriorityHeartbeat {
		t.Errorf("expected item[2] to be Heartbeat (4), got %d", items[2].Priority)
	}
	if items[3].Priority != PriorityMetrics {
		t.Errorf("expected item[3] to be Metrics (5), got %d", items[3].Priority)
	}
	if items[4].Priority != PriorityInventory {
		t.Errorf("expected item[4] to be Inventory (6), got %d", items[4].Priority)
	}

	// Remove item 0
	if err := buf.Remove(items[0].ID); err != nil {
		t.Fatalf("remove failed: %v", err)
	}
	if buf.Len() != 4 {
		t.Fatalf("expected 4 items after remove, got %d", buf.Len())
	}
}

func TestPriorityBufferEviction(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "buffer-test-evict-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "buffer.json")
	// Small buffer of ~200 bytes
	buf, err := NewPriorityBuffer(dbPath, 250)
	if err != nil {
		t.Fatalf("NewPriorityBuffer: %v", err)
	}

	// Enqueue a low priority inventory payload (large enough to near capacity)
	largeStr := make([]byte, 230)
	for i := range largeStr {
		largeStr[i] = 'A'
	}
	_ = buf.Enqueue(PriorityInventory, "/agent/inventory", map[string]string{"data": string(largeStr)})

	// Now enqueue a critical security transition
	secData := map[string]string{"action": "antivirus_disabled"}
	err = buf.Enqueue(PrioritySecurity, "/agent/events", secData)
	if err != nil {
		t.Fatalf("expected security item to succeed, got: %v", err)
	}

	items := buf.PeekSorted()
	// Inventory should have been evicted to make room for Security!
	for _, it := range items {
		if it.Priority == PriorityInventory {
			t.Errorf("expected inventory to be evicted, but still present")
		}
	}
	if len(items) == 0 || items[0].Priority != PrioritySecurity {
		t.Errorf("expected Security item to be preserved")
	}
}
