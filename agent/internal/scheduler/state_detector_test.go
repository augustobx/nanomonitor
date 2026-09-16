package scheduler

import (
	"testing"

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
)

func TestStateChangeDetector(t *testing.T) {
	detector := NewStateChangeDetector()

	// 1. Initial run: Antivirus ON, Firewall profiles ON
	sec1 := &collector.SecurityInfo{
		DefenderActive: true,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: true, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  true,
		},
	}

	events1 := detector.DetectSecurityChanges(sec1)
	if len(events1) != 0 {
		t.Fatalf("expected 0 events on baseline run, got %d", len(events1))
	}

	// 2. Second run: Antivirus disabled! (ON -> OFF)
	sec2 := &collector.SecurityInfo{
		DefenderActive: false,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: false, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  true,
		},
	}

	events2 := detector.DetectSecurityChanges(sec2)
	if len(events2) != 1 {
		t.Fatalf("expected 1 event for Antivirus ON -> OFF transition, got %d", len(events2))
	}
	if events2[0].Severity != "CRITICAL" {
		t.Errorf("expected CRITICAL severity, got %s", events2[0].Severity)
	}
	if events2[0].RawData["currentState"] != "disabled" {
		t.Errorf("expected currentState=disabled, got %v", events2[0].RawData["currentState"])
	}

	// 3. Third run: Unchanged (still OFF) -> 0 events
	events3 := detector.DetectSecurityChanges(sec2)
	if len(events3) != 0 {
		t.Fatalf("expected 0 events for unchanged state, got %d", len(events3))
	}

	// 4. Fourth run: Antivirus reactivated (OFF -> ON) + Public Firewall disabled!
	sec4 := &collector.SecurityInfo{
		DefenderActive: true,
		AntivirusList: []collector.AntivirusInfo{
			{DisplayName: "Windows Defender", Enabled: true, UpToDate: true},
		},
		FirewallProfiles: collector.FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  false, // Turned OFF!
		},
	}

	events4 := detector.DetectSecurityChanges(sec4)
	if len(events4) != 2 {
		t.Fatalf("expected 2 events (AV reactivated + Public Firewall disabled), got %d", len(events4))
	}

	// 5. SMART degradation test
	smart1 := &collector.SmartReport{
		OverallStatus: "OK",
	}
	smartEvents1 := detector.DetectSmartChanges(smart1)
	if len(smartEvents1) != 0 {
		t.Fatalf("expected 0 events on baseline SMART run, got %d", len(smartEvents1))
	}

	smart2 := &collector.SmartReport{
		OverallStatus: "CRITICAL",
		DegradedCount: 1,
	}
	smartEvents2 := detector.DetectSmartChanges(smart2)
	if len(smartEvents2) != 1 {
		t.Fatalf("expected 1 event on SMART degradation, got %d", len(smartEvents2))
	}
	if smartEvents2[0].Severity != "CRITICAL" {
		t.Errorf("expected CRITICAL for SMART degradation, got %s", smartEvents2[0].Severity)
	}
}
