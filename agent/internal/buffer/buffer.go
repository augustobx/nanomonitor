package buffer

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Priority represents the importance level of buffered telemetry
type Priority int

const (
	PrioritySecurity      Priority = 1 // SECURITY_STATE_CHANGED
	PriorityCriticalEvent Priority = 2 // KernelPower, BSOD, NTFS corruption
	PriorityAlert         Priority = 3 // Warnings, app crashes, service crashes
	PriorityHeartbeat     Priority = 4 // Periodic heartbeat
	PriorityMetrics       Priority = 5 // Performance CPU/RAM/Volumes
	PriorityInventory     Priority = 6 // Full hardware/software inventory
)

// Item represents a single queued telemetry payload
type Item struct {
	ID        string          `json:"id"`
	Priority  Priority        `json:"priority"`
	Endpoint  string          `json:"endpoint"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"createdAt"`
	SizeBytes int             `json:"sizeBytes"`
}

// PriorityBuffer manages disk-backed prioritized offline queueing
type PriorityBuffer struct {
	mu         sync.Mutex
	filePath   string
	maxBytes   int
	totalBytes int
	items      []*Item
}

// NewPriorityBuffer creates or loads an offline priority buffer
func NewPriorityBuffer(filePath string, maxSizeBytes int) (*PriorityBuffer, error) {
	if maxSizeBytes <= 0 {
		maxSizeBytes = 10 * 1024 * 1024 // 10 MB default
	}

	pb := &PriorityBuffer{
		filePath: filePath,
		maxBytes: maxSizeBytes,
		items:    make([]*Item, 0),
	}

	// Try loading existing buffer file if present
	if err := pb.loadFromDisk(); err != nil {
		// If corrupted, remove and start clean
		_ = os.Remove(filePath)
	}

	return pb, nil
}

// Enqueue adds an item with the given priority, evicting lower priority items if needed
func (b *PriorityBuffer) Enqueue(priority Priority, endpoint string, payload interface{}) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling buffer item: %w", err)
	}

	id := generateID()
	itemSize := len(raw)

	b.mu.Lock()
	defer b.mu.Unlock()

	// Evict lower priority items if adding this item would exceed buffer capacity
	for b.totalBytes+itemSize > b.maxBytes && len(b.items) > 0 {
		evicted := b.evictOneLowerPriority(priority)
		if !evicted {
			// Cannot evict any item of lower or equal priority
			if priority >= PriorityMetrics {
				// Drop non-critical item rather than crashing
				return fmt.Errorf("buffer full, dropped priority %d item", priority)
			}
			// For high priority, evict the oldest item of the lowest priority present
			b.evictLowestAvailable()
		}
	}

	item := &Item{
		ID:        id,
		Priority:  priority,
		Endpoint:  endpoint,
		Payload:   raw,
		CreatedAt: time.Now().UTC(),
		SizeBytes: itemSize,
	}

	b.items = append(b.items, item)
	b.totalBytes += itemSize

	return b.saveToDisk()
}

// Len returns current item count
func (b *PriorityBuffer) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.items)
}

// SizeBytes returns total stored payload bytes
func (b *PriorityBuffer) SizeBytes() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.totalBytes
}

// PeekSorted returns all items sorted by Priority ASC (1 first), then CreatedAt ASC
func (b *PriorityBuffer) PeekSorted() []*Item {
	b.mu.Lock()
	defer b.mu.Unlock()

	sorted := make([]*Item, len(b.items))
	copy(sorted, b.items)

	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Priority != sorted[j].Priority {
			return sorted[i].Priority < sorted[j].Priority
		}
		return sorted[i].CreatedAt.Before(sorted[j].CreatedAt)
	})

	return sorted
}

// Remove deletes an item by ID after successful transmission
func (b *PriorityBuffer) Remove(id string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i, item := range b.items {
		if item.ID == id {
			b.totalBytes -= item.SizeBytes
			b.items = append(b.items[:i], b.items[i+1:]...)
			return b.saveToDisk()
		}
	}
	return nil
}

// evictOneLowerPriority removes the oldest item having priority > threshold
func (b *PriorityBuffer) evictOneLowerPriority(threshold Priority) bool {
	// Find highest priority number (lowest importance) > threshold
	maxP := Priority(0)
	var targetIdx = -1

	for i, it := range b.items {
		if it.Priority > threshold {
			if it.Priority > maxP {
				maxP = it.Priority
				targetIdx = i
			}
		}
	}

	if targetIdx >= 0 {
		b.totalBytes -= b.items[targetIdx].SizeBytes
		b.items = append(b.items[:targetIdx], b.items[targetIdx+1:]...)
		return true
	}

	return false
}

// evictLowestAvailable evicts the oldest item among the lowest priority present
func (b *PriorityBuffer) evictLowestAvailable() {
	if len(b.items) == 0 {
		return
	}

	maxP := Priority(0)
	targetIdx := 0

	for i, it := range b.items {
		if it.Priority > maxP {
			maxP = it.Priority
			targetIdx = i
		}
	}

	b.totalBytes -= b.items[targetIdx].SizeBytes
	b.items = append(b.items[:targetIdx], b.items[targetIdx+1:]...)
}

func (b *PriorityBuffer) loadFromDisk() error {
	if b.filePath == "" {
		return nil
	}
	data, err := os.ReadFile(b.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var loaded []*Item
	if err := json.Unmarshal(data, &loaded); err != nil {
		return err
	}

	b.items = loaded
	b.totalBytes = 0
	for _, it := range b.items {
		b.totalBytes += it.SizeBytes
	}
	return nil
}

func (b *PriorityBuffer) saveToDisk() error {
	if b.filePath == "" {
		return nil
	}

	dir := filepath.Dir(b.filePath)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}

	data, err := json.Marshal(b.items)
	if err != nil {
		return err
	}

	return os.WriteFile(b.filePath, data, 0600)
}

func generateID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
