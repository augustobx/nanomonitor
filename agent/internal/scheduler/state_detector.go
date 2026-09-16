package scheduler

import (
	"fmt"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
)

// SecurityStateSnapshot tracks previous known antivirus and firewall profiles
type SecurityStateSnapshot struct {
	AntivirusEnabled bool
	AntivirusProduct string
	FirewallDomain   bool
	FirewallPrivate  bool
	FirewallPublic   bool
	Initialized      bool
}

// SmartStateSnapshot tracks previous known SMART physical drive health
type SmartStateSnapshot struct {
	OverallStatus string // "OK", "WARNING", "CRITICAL"
	Initialized   bool
}

// StateChangeDetector keeps track of system telemetry state and detects critical transitions
type StateChangeDetector struct {
	lastSecurity SecurityStateSnapshot
	lastSmart    SmartStateSnapshot
}

// NewStateChangeDetector initializes a new state change detector
func NewStateChangeDetector() *StateChangeDetector {
	return &StateChangeDetector{}
}

// DetectSecurityChanges compares current security state against the previous snapshot.
// Returns instant DeviceEventPayload notifications on any transition (ON->OFF or OFF->ON).
func (d *StateChangeDetector) DetectSecurityChanges(sec *collector.SecurityInfo) []collector.DeviceEventPayload {
	if sec == nil {
		return nil
	}

	current := SecurityStateSnapshot{
		AntivirusEnabled: sec.HasEnabledAV(),
		AntivirusProduct: sec.PrimaryAVName(),
		FirewallDomain:   sec.FirewallProfiles.Domain,
		FirewallPrivate:  sec.FirewallProfiles.Private,
		FirewallPublic:   sec.FirewallProfiles.Public,
		Initialized:      true,
	}

	// First execution establishes baseline without triggering events
	if !d.lastSecurity.Initialized {
		d.lastSecurity = current
		return nil
	}

	var events []collector.DeviceEventPayload
	now := time.Now().UTC()

	// 1. Antivirus transition
	if d.lastSecurity.AntivirusEnabled != current.AntivirusEnabled {
		prev := "disabled"
		curr := "enabled"
		sev := "INFO"
		title := fmt.Sprintf("Antivirus reactivado: %s", current.AntivirusProduct)
		if !current.AntivirusEnabled {
			prev = "enabled"
			curr = "disabled"
			sev = "CRITICAL"
			title = fmt.Sprintf("¡Antivirus desactivado!: %s", current.AntivirusProduct)
		}

		events = append(events, collector.DeviceEventPayload{
			Timestamp:   now,
			Source:      "SecurityStateDetector",
			Category:    "Security",
			Severity:    sev,
			Title:       title,
			Description: fmt.Sprintf("El estado de protección en tiempo real pasó de %s a %s.", prev, curr),
			DedupKey:    fmt.Sprintf("SecurityState:Antivirus:%s", curr),
			RawData: map[string]interface{}{
				"component":     "antivirus",
				"previousState": prev,
				"currentState":  curr,
				"product":       current.AntivirusProduct,
				"detectedAt":    now.Format(time.RFC3339),
			},
		})
	}

	// 2. Firewall profile transitions
	profiles := []struct {
		name string
		prev bool
		curr bool
	}{
		{"domain", d.lastSecurity.FirewallDomain, current.FirewallDomain},
		{"private", d.lastSecurity.FirewallPrivate, current.FirewallPrivate},
		{"public", d.lastSecurity.FirewallPublic, current.FirewallPublic},
	}

	for _, p := range profiles {
		if p.prev != p.curr {
			prev := "disabled"
			curr := "enabled"
			sev := "INFO"
			title := fmt.Sprintf("Firewall perfil %s reactivado", p.name)
			if !p.curr {
				prev = "enabled"
				curr = "disabled"
				sev = "HIGH"
				title = fmt.Sprintf("¡Firewall perfil %s desactivado!", p.name)
			}

			events = append(events, collector.DeviceEventPayload{
				Timestamp:   now,
				Source:      "SecurityStateDetector",
				Category:    "Security",
				Severity:    sev,
				Title:       title,
				Description: fmt.Sprintf("El perfil de firewall '%s' cambió de %s a %s.", p.name, prev, curr),
				DedupKey:    fmt.Sprintf("SecurityState:Firewall:%s:%s", p.name, curr),
				RawData: map[string]interface{}{
					"component":     "firewall",
					"profile":       p.name,
					"previousState": prev,
					"currentState":  curr,
					"detectedAt":    now.Format(time.RFC3339),
				},
			})
		}
	}

	// Update snapshot
	d.lastSecurity = current
	return events
}

// DetectSmartChanges inspects physical drive status for health degradation
func (d *StateChangeDetector) DetectSmartChanges(report *collector.SmartReport) []collector.DeviceEventPayload {
	if report == nil {
		return nil
	}

	if !d.lastSmart.Initialized {
		d.lastSmart = SmartStateSnapshot{
			OverallStatus: report.OverallStatus,
			Initialized:   true,
		}
		return nil
	}

	var events []collector.DeviceEventPayload
	now := time.Now().UTC()

	// Detect degradation: OK -> WARNING / CRITICAL, or WARNING -> CRITICAL
	if (d.lastSmart.OverallStatus == "OK" && report.OverallStatus != "OK") ||
		(d.lastSmart.OverallStatus == "WARNING" && report.OverallStatus == "CRITICAL") {

		events = append(events, collector.DeviceEventPayload{
			Timestamp:   now,
			Source:      "SmartStateDetector",
			Category:    "DiskError",
			Severity:    report.OverallStatus,
			Title:       fmt.Sprintf("Degradación de salud en almacenamiento físico (SMART: %s)", report.OverallStatus),
			Description: fmt.Sprintf("El estado de discos físicos cambió de %s a %s (%d discos con anomalías).", d.lastSmart.OverallStatus, report.OverallStatus, report.DegradedCount),
			DedupKey:    fmt.Sprintf("SmartState:%s", report.OverallStatus),
			RawData: map[string]interface{}{
				"previousStatus": d.lastSmart.OverallStatus,
				"currentStatus":  report.OverallStatus,
				"degradedCount":  report.DegradedCount,
				"disks":          report.Disks,
				"detectedAt":     now.Format(time.RFC3339),
			},
		})
	}

	d.lastSmart.OverallStatus = report.OverallStatus
	return events
}
