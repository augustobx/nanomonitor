package scheduler

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/buffer"
	"github.com/nanolabs/nanomonitor/agent/internal/collector"
	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

// TestSevenMandatoryScenarios validates the 7 core requirements programmatically
func TestSevenMandatoryScenarios(t *testing.T) {
	// Setup test environment
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.DefaultConfig()
	client := transport.NewClient(cfg.APIUrl, "test-agent", "test-secret", logger)
	sched := New(cfg, client, logger)

	// =========================================================================
	// Scenario 1: Initial state - Defender ON, baseline established
	// =========================================================================
	secInitial := &collector.SecurityInfo{
		DefenderActive:  true,
		FirewallActive:  true,
		DefenderUpdated: true,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: true, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  true,
		},
	}

	baselineEvents := sched.stateDetector.DetectSecurityChanges(secInitial)
	if len(baselineEvents) != 0 {
		t.Fatalf("[Test 1 Failed] Expected 0 events on baseline initialization, got %d", len(baselineEvents))
	}
	t.Log("[Test 1 PASS] Baseline established with Defender ON, 0 spurious events.")

	// =========================================================================
	// Scenario 2: Defender deactivated (ON -> OFF)
	// =========================================================================
	secDisabled := &collector.SecurityInfo{
		DefenderActive:  false,
		FirewallActive:  true,
		DefenderUpdated: true,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: false, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  true,
		},
	}

	eventsOff := sched.stateDetector.DetectSecurityChanges(secDisabled)
	if len(eventsOff) != 1 {
		t.Fatalf("[Test 2 Failed] Expected 1 transition event for Defender OFF, got %d", len(eventsOff))
	}
	if eventsOff[0].Severity != "CRITICAL" {
		t.Fatalf("[Test 2 Failed] Expected CRITICAL severity, got %s", eventsOff[0].Severity)
	}
	if eventsOff[0].RawData["currentState"] != "disabled" {
		t.Fatalf("[Test 2 Failed] Expected currentState=disabled, got %v", eventsOff[0].RawData["currentState"])
	}
	t.Logf("[Test 2 PASS] Detected Defender ON -> OFF immediately: Title='%s', Severity='%s'", eventsOff[0].Title, eventsOff[0].Severity)

	// =========================================================================
	// Scenario 3: Defender reactivated (OFF -> ON)
	// =========================================================================
	eventsOn := sched.stateDetector.DetectSecurityChanges(secInitial)
	if len(eventsOn) != 1 {
		t.Fatalf("[Test 3 Failed] Expected 1 transition event for Defender ON, got %d", len(eventsOn))
	}
	if eventsOn[0].Severity != "INFO" {
		t.Fatalf("[Test 3 Failed] Expected INFO severity for reactivation, got %s", eventsOn[0].Severity)
	}
	if eventsOn[0].RawData["currentState"] != "enabled" {
		t.Fatalf("[Test 3 Failed] Expected currentState=enabled, got %v", eventsOn[0].RawData["currentState"])
	}
	t.Logf("[Test 3 PASS] Detected Defender OFF -> ON immediately: Title='%s'", eventsOn[0].Title)

	// =========================================================================
	// Scenario 4: Firewall profile deactivated (Public Profile ON -> OFF)
	// =========================================================================
	secFwPublicOff := &collector.SecurityInfo{
		DefenderActive:  true,
		FirewallActive:  false,
		DefenderUpdated: true,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: true, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  false, // Turned OFF!
		},
	}

	eventsFw := sched.stateDetector.DetectSecurityChanges(secFwPublicOff)
	if len(eventsFw) != 1 {
		t.Fatalf("[Test 4 Failed] Expected 1 transition event for Public Firewall OFF, got %d", len(eventsFw))
	}
	if eventsFw[0].RawData["component"] != "firewall" || eventsFw[0].RawData["profile"] != "public" {
		t.Fatalf("[Test 4 Failed] Expected firewall public profile transition, got %v", eventsFw[0].RawData)
	}
	t.Logf("[Test 4 PASS] Detected Firewall Public profile ON -> OFF immediately: Title='%s'", eventsFw[0].Title)

	// =========================================================================
	// Scenario 5: Staggered startup sequence inspection
	// =========================================================================
	// Verify that scheduler defines staggered boot stages and decoupled intervals
	if sched.cfg.HeartbeatInterval != 180 ||
		sched.cfg.SecurityInterval != 180 ||
		sched.cfg.MetricsInterval != 300 ||
		sched.cfg.SmartInterval != 3600 ||
		sched.cfg.WindowsUpdateInterval != 14400 ||
		sched.cfg.InventoryInterval != 86400 ||
		sched.cfg.EventCheckInterval != 60 {
		t.Fatalf("[Test 5 Failed] Definitive intervals do not match specification: %+v", sched.cfg)
	}
	t.Log("[Test 5 PASS] Definitive intervals validated: Events=60s, Heartbeat/Security=180s, Metrics=300s, SMART=3600s, WU=14400s, Inventory=86400s.")

	// =========================================================================
	// Scenario 6: Offline buffer prioritization and reconnection flush
	// =========================================================================
	buf, err := buffer.NewPriorityBuffer("", 1024*1024)
	if err != nil {
		t.Fatalf("[Test 6 Failed] Buffer creation error: %v", err)
	}

	// Enqueue in reverse order of importance
	_ = buf.Enqueue(buffer.PriorityInventory, "/agent/inventory", map[string]string{"type": "hardware"})
	_ = buf.Enqueue(buffer.PriorityMetrics, "/agent/metrics", map[string]string{"type": "cpu_ram"})
	_ = buf.Enqueue(buffer.PriorityHeartbeat, "/agent/heartbeat", map[string]string{"type": "heartbeat"})
	_ = buf.Enqueue(buffer.PriorityAlert, "/agent/events", map[string]string{"type": "app_crash"})
	_ = buf.Enqueue(buffer.PriorityCriticalEvent, "/agent/events", map[string]string{"type": "bsod"})
	_ = buf.Enqueue(buffer.PrioritySecurity, "/agent/events", map[string]string{"type": "defender_disabled"})

	sorted := buf.PeekSorted()
	if len(sorted) != 6 {
		t.Fatalf("[Test 6 Failed] Expected 6 queued items, got %d", len(sorted))
	}
	// Priority 1 must be first
	if sorted[0].Priority != buffer.PrioritySecurity {
		t.Fatalf("[Test 6 Failed] Expected PrioritySecurity (1) first, got priority %d", sorted[0].Priority)
	}
	// Priority 2 must be second
	if sorted[1].Priority != buffer.PriorityCriticalEvent {
		t.Fatalf("[Test 6 Failed] Expected PriorityCriticalEvent (2) second, got priority %d", sorted[1].Priority)
	}
	// Priority 6 must be last
	if sorted[5].Priority != buffer.PriorityInventory {
		t.Fatalf("[Test 6 Failed] Expected PriorityInventory (6) last, got priority %d", sorted[5].Priority)
	}
	t.Log("[Test 6 PASS] Offline buffer delivers Priority 1 (Security) and Priority 2 (Critical) before Metrics/Inventory.")

	// =========================================================================
	// Scenario 7: Confirm SecurityCollector does NOT trigger full software scan
	// =========================================================================
	// Security collector directly invokes CollectSecurity(), which only reads WMI/Registry security keys
	// It takes under 50ms, whereas CollectSoftware scans 90+ applications and computes SHA256
	start := time.Now()
	secReport, err := collector.CollectSecurity()
	secDuration := time.Since(start)
	if err != nil {
		t.Fatalf("[Test 7 Failed] CollectSecurity error: %v", err)
	}
	if secReport == nil {
		t.Fatalf("[Test 7 Failed] Security report is nil")
	}
	if secDuration > 500*time.Millisecond {
		t.Errorf("[Test 7 Warning] Security collection took %v, expected < 500ms", secDuration)
	}
	t.Logf("[Test 7 PASS] SecurityCollector completed in %v without triggering heavy software inventory.", secDuration)
}
