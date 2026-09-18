package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/actions"
	"github.com/nanolabs/nanomonitor/agent/internal/buffer"
	"github.com/nanolabs/nanomonitor/agent/internal/collector"
	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/patch"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

// Scheduler manages the tick loops for decoupled data collection types
type Scheduler struct {
	cfg           *config.Config
	client        *transport.Client
	logger        *slog.Logger
	buffer        *buffer.PriorityBuffer
	stateDetector *StateChangeDetector
	wg            sync.WaitGroup

	// State tracking
	lastInventoryChecksum string
	lastSoftwareChecksum  string
	lastSoftwareItems     []collector.SoftwareItem
	lastEventRecordIDs    map[string]uint64
	lastLatencyMs         int
}

// New creates a new Scheduler with priority buffering and state change detection
func New(cfg *config.Config, client *transport.Client, logger *slog.Logger) *Scheduler {
	// Initialize priority offline buffer
	buf, err := buffer.NewPriorityBuffer(cfg.BufferDBPath, cfg.BufferMaxSizeMB*1024*1024)
	if err != nil {
		logger.Warn("failed to open priority buffer DB, operating in-memory only", "error", err)
	}

	return &Scheduler{
		cfg:                cfg,
		client:             client,
		logger:             logger,
		buffer:             buf,
		stateDetector:      NewStateChangeDetector(),
		lastEventRecordIDs: make(map[string]uint64),
	}
}

// Run starts all decoupled collection loops with staggered boot and blocks until ctx is cancelled
func (s *Scheduler) Run(ctx context.Context) error {
	s.logger.Info("scheduler starting with decoupled telemetry architecture",
		"heartbeat_sec", s.cfg.HeartbeatInterval,
		"security_sec", s.cfg.SecurityInterval,
		"metrics_sec", s.cfg.MetricsInterval,
		"smart_sec", s.cfg.SmartInterval,
		"wu_sec", s.cfg.WindowsUpdateInterval,
		"inventory_sec", s.cfg.InventoryInterval,
		"events_sec", s.cfg.EventCheckInterval,
	)

	// Establish baseline watermark for Windows Event Log before starting loops
	s.lastEventRecordIDs = collector.GetInitialHighestRecordIDs()
	s.logger.Info("events baseline established", "record_ids", s.lastEventRecordIDs)

	// Execute staggered startup sequence to avoid CPU/disk/network contention
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.executeStaggeredStartup(ctx)
	}()

	// 1. Critical System Events Loop (every 60s, exact cadence, no jitter)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopExact(ctx, "events", time.Duration(s.cfg.EventCheckInterval)*time.Second, s.collectAndSendEvents)
	}()

	// 2. Heartbeat + Operational Security State Loop (every 180s / 3m)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopExact(ctx, "heartbeat_security", time.Duration(s.cfg.HeartbeatInterval)*time.Second, s.collectAndSendHeartbeatAndSecurity)
	}()

	// 3. Performance Metrics Loop (every 300s / 5m ± 10s jitter)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopWithJitter(ctx, "metrics", time.Duration(s.cfg.MetricsInterval)*time.Second, 10*time.Second, s.collectAndSendMetrics)
	}()

	// 4. Physical Storage & SMART Health Loop (every 3600s / 60m ± 60s jitter)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopWithJitter(ctx, "smart", time.Duration(s.cfg.SmartInterval)*time.Second, 60*time.Second, s.collectAndSendSmart)
	}()

	// 5. Windows Update Loop (every 14400s / 4h ± 120s jitter)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopWithJitter(ctx, "windows_update", time.Duration(s.cfg.WindowsUpdateInterval)*time.Second, 120*time.Second, s.collectAndSendWindowsUpdate)
	}()

	// 6. Low-Frequency General Inventory (every 86400s / 24h + 300s jitter)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoopWithJitter(ctx, "inventory", time.Duration(s.cfg.InventoryInterval)*time.Second, 300*time.Second, func(ctx context.Context) {
			s.collectAndSendInventory(ctx)
			s.collectAndSendSoftware(ctx)
		})
	}()

	// 7. Outbound Remote Actions Poller Loop (continuous outbound long-polling)
	actionPoller := actions.NewPoller(s.client, s.logger.With("component", "actions"), s)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		actionPoller.Run(ctx)
	}()

	// Wait for cancellation
	<-ctx.Done()
	s.wg.Wait()
	s.logger.Info("scheduler stopped")
	return nil
}

// executeStaggeredStartup executes boot collectors spaced in time to prevent system freeze
func (s *Scheduler) executeStaggeredStartup(ctx context.Context) {
	log := s.logger.With("phase", "startup")
	log.Info("executing staggered startup sequence...")

	// T0: Heartbeat + Security state immediate check
	s.collectAndSendHeartbeatAndSecurity(ctx)

	// T+5s: Windows Update check
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Second):
		s.collectAndSendWindowsUpdate(ctx)
	}

	// T+10s: SMART physical disk check
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Second):
		s.collectAndSendSmart(ctx)
	}

	// T+15s: General hardware & software inventory
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Second):
		s.collectAndSendInventory(ctx)
		s.collectAndSendSoftware(ctx)
	}

	// T+20s: Flush any remaining offline buffered items
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Second):
		s.flushOfflineBuffer(ctx)
	}

	log.Info("staggered startup sequence completed successfully")
}

// runLoopExact runs a ticker without jitter for critical events & heartbeat
func (s *Scheduler) runLoopExact(ctx context.Context, name string, interval time.Duration, fn func(ctx context.Context)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	s.logger.Info("exact cadence loop started", "name", name, "interval", interval.String())

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("loop stopping", "name", name)
			return
		case <-ticker.C:
			fn(ctx)
			s.flushOfflineBuffer(ctx)
		}
	}
}

// runLoopWithJitter runs a ticker with a randomized jitter offset
func (s *Scheduler) runLoopWithJitter(ctx context.Context, name string, baseInterval, jitterRange time.Duration, fn func(ctx context.Context)) {
	s.logger.Info("jittered loop started", "name", name, "base_interval", baseInterval.String())

	for {
		// Calculate jitter between -jitterRange and +jitterRange
		var jitter time.Duration
		if jitterRange > 0 {
			jitterSec := (rand.Float64()*2 - 1) * jitterRange.Seconds()
			jitter = time.Duration(jitterSec * float64(time.Second))
		}
		sleepDuration := baseInterval + jitter
		if sleepDuration < 5*time.Second {
			sleepDuration = 5 * time.Second
		}

		select {
		case <-ctx.Done():
			s.logger.Info("loop stopping", "name", name)
			return
		case <-time.After(sleepDuration):
			fn(ctx)
			s.flushOfflineBuffer(ctx)
		}
	}
}

// collectAndSendHeartbeatAndSecurity runs every 3 minutes (Heartbeat + lightweight SecurityState)
func (s *Scheduler) collectAndSendHeartbeatAndSecurity(ctx context.Context) {
	if err := s.collectAndSendHeartbeatAndSecurityConfirmed(ctx); err != nil {
		s.logger.With("task", "heartbeat_security").Debug("heartbeat cycle not confirmed", "error", err)
	}
}

func (s *Scheduler) collectAndSendHeartbeatAndSecurityConfirmed(ctx context.Context) error {
	log := s.logger.With("task", "heartbeat_security")

	perf, perfErr := collector.CollectPerformance()
	if perfErr != nil {
		log.Error("failed to collect performance for heartbeat", "error", perfErr)
	}

	latencyMs := collector.MeasureServerLatency(s.cfg.APIUrl)
	s.lastLatencyMs = latencyMs

	sec, secErr := collector.CollectSecurity()
	if secErr != nil {
		log.Warn("failed to collect security state", "error", secErr)
	}

	if sec != nil {
		transitions := s.stateDetector.DetectSecurityChanges(sec)
		if len(transitions) > 0 {
			log.Info("SECURITY STATE TRANSITION DETECTED! Sending immediately", "count", len(transitions))
			for _, tr := range transitions {
				s.sendEventImmediate(ctx, tr, buffer.PrioritySecurity)
			}
		}
	}

	payload := &transport.HeartbeatPayload{
		DeviceID:        s.cfg.DeviceID,
		AgentID:         s.cfg.AgentID,
		AgentVersion:    version.Version,
		Timestamp:       time.Now().UTC(),
		Status:          "healthy",
		ServerLatencyMs: int64(s.lastLatencyMs),
		Security:        sec,
	}
	if perf != nil {
		payload.UptimeSeconds = perf.UptimeSecs
		payload.CPUPercent = perf.CPUPercent
		payload.RAMUsedMB = perf.RAMUsedMB
		payload.RAMAvailMB = perf.RAMAvailMB
		payload.DiskSummary = perf.Volumes
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendHeartbeat(ctx, payload)
	}, 2)
	if err != nil {
		log.Warn("failed to send heartbeat, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityHeartbeat, "/agent/heartbeat", payload); bufferErr != nil {
				return fmt.Errorf("heartbeat delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("heartbeat not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Warn("heartbeat rejected by server", "status", resp.StatusCode)
		return fmt.Errorf("heartbeat rejected by server with HTTP %d", resp.StatusCode)
	}

	var hbResp struct {
		Status           string `json:"status"`
		TamperProtection *struct {
			Enabled bool   `json:"enabled"`
			Key     string `json:"key"`
		} `json:"tamperProtection"`
	}
	if err := json.Unmarshal(resp.Body, &hbResp); err == nil && hbResp.TamperProtection != nil {
		changed := false
		if hbResp.TamperProtection.Key != "" && hbResp.TamperProtection.Key != s.cfg.TamperKey {
			s.cfg.TamperKey = hbResp.TamperProtection.Key
			changed = true
		}
		if s.cfg.TamperProtectionEnabled != hbResp.TamperProtection.Enabled {
			s.cfg.TamperProtectionEnabled = hbResp.TamperProtection.Enabled
			changed = true
		}
		if changed {
			if err := s.cfg.Save(); err != nil {
				log.Warn("failed to persist tamper protection state", "error", err)
				return fmt.Errorf("heartbeat accepted but local tamper state could not be persisted: %w", err)
			}
			log.Info("tamper protection state synchronized from NOC",
				"enabled", hbResp.TamperProtection.Enabled,
			)
		}
	}

	log.Debug("heartbeat + security sent successfully",
		"latency_ms", s.lastLatencyMs,
		"defender_active", sec != nil && sec.DefenderActive,
		"firewall_active", sec != nil && sec.FirewallActive,
	)

	if secErr != nil {
		return fmt.Errorf("heartbeat accepted but security collection was partial: %w", secErr)
	}
	return nil
}
func (s *Scheduler) collectAndSendMetrics(ctx context.Context) {
	if err := s.collectAndSendMetricsConfirmed(ctx); err != nil {
		s.logger.With("task", "metrics").Debug("metrics cycle not confirmed", "error", err)
	}
}

func (s *Scheduler) collectAndSendMetricsConfirmed(ctx context.Context) error {
	log := s.logger.With("task", "metrics")

	perf, err := collector.CollectPerformance()
	if err != nil {
		log.Error("failed to collect performance metrics", "error", err)
		return fmt.Errorf("collecting performance metrics: %w", err)
	}

	perf.Thermal = collector.CollectThermal()
	if perf.Thermal.Available {
		log.Debug("thermal telemetry collected",
			"thermal_status", perf.Thermal.Status,
			"cpu_available", perf.Thermal.CPU != nil,
			"gpu_count", len(perf.Thermal.GPUs),
		)
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendMetrics(ctx, perf)
	}, 2)
	if err != nil {
		log.Warn("failed to send metrics, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityMetrics, "/agent/metrics", perf); bufferErr != nil {
				return fmt.Errorf("metrics delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("metrics not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Warn("metrics rejected by server", "status", resp.StatusCode)
		return fmt.Errorf("metrics rejected by server with HTTP %d", resp.StatusCode)
	}

	log.Debug("performance metrics sent successfully",
		"cpu", perf.CPUPercent,
		"ram_percent", perf.RAMPercent,
		"volumes", len(perf.Volumes),
	)
	return nil
}
func (s *Scheduler) collectAndSendSmart(ctx context.Context) {
	if err := s.collectAndSendSmartConfirmed(ctx); err != nil {
		s.logger.With("task", "smart").Debug("SMART cycle not confirmed", "error", err)
	}
}

func (s *Scheduler) collectAndSendSmartConfirmed(ctx context.Context) error {
	log := s.logger.With("task", "smart")

	report, err := collector.CollectSmart()
	if err != nil {
		log.Warn("failed to collect SMART report", "error", err)
		return fmt.Errorf("collecting SMART report: %w", err)
	}

	degradations := s.stateDetector.DetectSmartChanges(report)
	if len(degradations) > 0 {
		log.Warn("STORAGE SMART DEGRADATION DETECTED! Sending immediate event", "status", report.OverallStatus)
		for _, ev := range degradations {
			s.sendEventImmediate(ctx, ev, buffer.PriorityCriticalEvent)
		}
	}

	payload := map[string]interface{}{
		"collectedAt": time.Now().UTC().Format(time.RFC3339Nano),
		"smart":       report,
	}
	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendInventory(ctx, payload)
	}, 2)
	if err != nil {
		log.Warn("failed to send smart telemetry, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityMetrics, "/agent/inventory", payload); bufferErr != nil {
				return fmt.Errorf("SMART delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("SMART telemetry not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("SMART telemetry rejected by server with HTTP %d", resp.StatusCode)
	}

	log.Debug("SMART health telemetry sent", "overall", report.OverallStatus, "disks", len(report.Disks))
	return nil
}
func (s *Scheduler) collectAndSendWindowsUpdate(ctx context.Context) {
	log := s.logger.With("task", "windows_update")

	// 1. Collect installed hotfixes and reboot status (lightweight WMI)
	wu, err := collector.CollectWindowsUpdate()
	if err != nil {
		log.Warn("failed to collect windows update info", "error", err)
		return
	}

	wuPayload := map[string]interface{}{
		"collectedAt":    time.Now().UTC().Format(time.RFC3339Nano),
		"windowsUpdate": wu,
	}
	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendInventory(ctx, wuPayload)
	}, 2)

	if err != nil {
		log.Warn("failed to send windows update telemetry, buffering offline", "error", err)
		if s.buffer != nil {
			_ = s.buffer.Enqueue(buffer.PriorityInventory, "/agent/inventory", wuPayload)
		}
	} else if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Debug("windows update telemetry sent", "reboot_pending", wu.RebootPending, "hotfixes", wu.HotfixCount)
	}

	// 2. Active scan for PENDING updates via COM Session (feeds DevicePatch table)
	s.scanAndReportPendingPatches(ctx)
}

// scanAndReportPendingPatches uses Microsoft.Update.Session COM to discover pending Windows Updates
// and reports them to /agent/patches/report for persistence in the CRM's DevicePatch table
func (s *Scheduler) scanAndReportPendingPatches(ctx context.Context) {
	log := s.logger.With("task", "patch_scan")

	scanResult, err := patch.ScanWindowsUpdates(ctx, 5*time.Minute)
	if err != nil {
		log.Warn("failed to scan pending windows updates via COM", "error", err)
		return
	}

	log.Info("pending windows update scan completed",
		"pending_count", len(scanResult.Patches),
		"reboot_pending", scanResult.RebootPending,
		"scan_duration_ms", scanResult.ScanDurationMs,
	)

	if err := s.ReportPatches(ctx, scanResult); err != nil {
		log.Warn("pending patch report was not confirmed", "error", err)
	}
}

// ReportPatches serializes and sends a patch scan result to /agent/patches/report
func (s *Scheduler) ReportPatches(ctx context.Context, scanResult *patch.ScanResult) error {
	log := s.logger.With("task", "patch_report")
	if scanResult == nil {
		return fmt.Errorf("patch scan result is nil")
	}

	patchItems := make([]map[string]interface{}, 0, len(scanResult.Patches))
	for _, p := range scanResult.Patches {
		status := "MISSING"
		if p.IsDownloaded {
			status = "DOWNLOADED"
		}

		patchItems = append(patchItems, map[string]interface{}{
			"kbArticleId":    p.KBArticleID,
			"title":          p.Title,
			"description":    p.Title,
			"category":       p.Category,
			"severity":       p.Severity,
			"status":         status,
			"sizeBytes":      p.SizeBytes,
			"requiresReboot": p.RequiresReboot,
		})
	}

	reportPayload := map[string]interface{}{
		"patches":       patchItems,
		"rebootPending": scanResult.RebootPending,
		"rebootReason":  scanResult.RebootReason,
		"scannedAt":     time.Now().UTC().Format(time.RFC3339Nano),
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendPatchReport(ctx, reportPayload)
	}, 2)
	if err != nil {
		log.Warn("failed to send patch report, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityInventory, "/agent/patches/report", reportPayload); bufferErr != nil {
				return fmt.Errorf("patch report delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("patch report not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Warn("patch report rejected by server", "status", resp.StatusCode, "body", string(resp.Body))
		return fmt.Errorf("patch report rejected by server with HTTP %d", resp.StatusCode)
	}

	log.Info("patch report sent successfully", "synced_patches", len(patchItems))
	return nil
}
func (s *Scheduler) collectAndSendInventory(ctx context.Context) {
	if err := s.collectAndSendInventoryConfirmed(ctx); err != nil {
		s.logger.With("task", "inventory").Debug("inventory cycle not confirmed", "error", err)
	}
}

func (s *Scheduler) collectAndSendInventoryConfirmed(ctx context.Context) error {
	log := s.logger.With("task", "inventory")
	var collectionIssues []string

	identity, err := collector.CollectIdentity()
	if err != nil {
		log.Error("failed to collect identity", "error", err)
		collectionIssues = append(collectionIssues, "identity: "+err.Error())
	}

	hardware, err := collector.CollectHardware()
	if err != nil {
		log.Error("failed to collect hardware", "error", err)
		collectionIssues = append(collectionIssues, "hardware: "+err.Error())
	}

	network, err := collector.CollectNetwork()
	if err != nil {
		log.Error("failed to collect network", "error", err)
		collectionIssues = append(collectionIssues, "network: "+err.Error())
	}
	if network != nil {
		network.ServerLatencyMs = s.lastLatencyMs
	}

	payload := map[string]interface{}{
		"collectedAt": time.Now().UTC().Format(time.RFC3339Nano),
		"identity":    identity,
		"hardware":    hardware,
		"network":     network,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendInventory(ctx, payload)
	}, 2)
	if err != nil {
		log.Warn("failed to send inventory, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityInventory, "/agent/inventory", payload); bufferErr != nil {
				return fmt.Errorf("inventory delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("inventory not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("inventory rejected by server with HTTP %d", resp.StatusCode)
	}

	log.Info("heavy general inventory sent successfully")
	if len(collectionIssues) > 0 {
		return fmt.Errorf("inventory accepted but local collection was partial: %s", strings.Join(collectionIssues, "; "))
	}
	return nil
}
func (s *Scheduler) collectAndSendSoftware(ctx context.Context) {
	if err := s.collectAndSendSoftwareConfirmed(ctx); err != nil {
		s.logger.With("task", "software").Debug("software cycle not confirmed", "error", err)
	}
}

func (s *Scheduler) collectAndSendSoftwareConfirmed(ctx context.Context) error {
	log := s.logger.With("task", "software")

	sw, err := collector.CollectSoftware()
	if err != nil {
		log.Error("failed to collect software inventory", "error", err)
		return fmt.Errorf("collecting software inventory: %w", err)
	}

	if s.lastSoftwareChecksum == sw.Checksum && len(s.lastSoftwareItems) > 0 {
		log.Debug("software inventory unchanged (checksum matches), skipping upload",
			"count", sw.Count,
			"checksum", sw.Checksum,
		)
		return nil
	}

	changes := collector.ComputeSoftwareDelta(s.lastSoftwareItems, sw.Items)
	payload := map[string]interface{}{
		"collectedAt": time.Now().UTC().Format(time.RFC3339Nano),
		"checksum":    sw.Checksum,
		"count":       sw.Count,
		"items":       sw.Items,
		"changes":     changes,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendSoftware(ctx, payload)
	}, 2)
	if err != nil {
		log.Warn("failed to send software inventory, buffering offline", "error", err)
		if s.buffer != nil {
			if bufferErr := s.buffer.Enqueue(buffer.PriorityInventory, "/agent/software", payload); bufferErr != nil {
				return fmt.Errorf("software delivery failed and offline buffer write failed: %v; buffer: %w", err, bufferErr)
			}
		}
		return fmt.Errorf("software inventory not confirmed by server; buffered for retry: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("software inventory rejected by server with HTTP %d", resp.StatusCode)
	}

	log.Info("software inventory sent successfully",
		"count", sw.Count,
		"changes", len(changes),
		"checksum", sw.Checksum,
	)
	s.lastSoftwareChecksum = sw.Checksum
	s.lastSoftwareItems = sw.Items
	return nil
}
func (s *Scheduler) collectAndSendEvents(ctx context.Context) {
	log := s.logger.With("task", "events")

	events, updatedIDs, err := collector.CollectRecentEvents(s.lastEventRecordIDs)
	if err != nil {
		log.Warn("failed to collect recent events", "error", err)
		return
	}

	s.lastEventRecordIDs = updatedIDs

	if len(events) == 0 {
		return
	}

	log.Info("new system events detected", "count", len(events))

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendEvents(ctx, events)
	}, 2)

	if err != nil {
		log.Warn("failed to send events, buffering offline", "error", err)
		if s.buffer != nil {
			for _, ev := range events {
				pri := buffer.PriorityAlert
				if ev.Severity == "CRITICAL" {
					pri = buffer.PriorityCriticalEvent
				}
				_ = s.buffer.Enqueue(pri, "/agent/events", []collector.DeviceEventPayload{ev})
			}
		}
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Info("events sent successfully", "count", len(events))
	} else {
		log.Warn("events rejected", "status", resp.StatusCode)
	}
}

// sendEventImmediate transmits a critical event immediately or queues it in priority buffer
func (s *Scheduler) sendEventImmediate(ctx context.Context, ev collector.DeviceEventPayload, pri buffer.Priority) {
	log := s.logger.With("event_immediate", ev.Title, "priority", pri)

	payload := []collector.DeviceEventPayload{ev}
	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendEvents(ctx, payload)
	}, 2)

	if err != nil || resp == nil || resp.StatusCode >= 400 {
		log.Warn("immediate event transmission failed, queueing in priority buffer", "error", err)
		if s.buffer != nil {
			_ = s.buffer.Enqueue(pri, "/agent/events", payload)
		}
		return
	}

	log.Info("immediate event transmitted successfully to API")
}

// flushOfflineBuffer drains buffered items in strict priority order
func (s *Scheduler) flushOfflineBuffer(ctx context.Context) {
	if s.buffer == nil || s.buffer.Len() == 0 {
		return
	}

	items := s.buffer.PeekSorted()
	if len(items) == 0 {
		return
	}

	s.logger.Info("flushing offline priority buffer", "items_queued", len(items), "size_bytes", s.buffer.SizeBytes())

	flushedCount := 0
	for _, item := range items {
		var err error
		var resp *transport.Response

		switch item.Endpoint {
		case "/agent/events":
			var payloads []collector.DeviceEventPayload
			if err = json.Unmarshal(item.Payload, &payloads); err != nil {
				// Fallback: try single payload
				var single collector.DeviceEventPayload
				if errSingle := json.Unmarshal(item.Payload, &single); errSingle == nil {
					payloads = []collector.DeviceEventPayload{single}
					err = nil
				}
			}
			if err == nil {
				resp, err = s.client.SendEvents(ctx, payloads)
			}
		case "/agent/heartbeat":
			var payload transport.HeartbeatPayload
			if err = json.Unmarshal(item.Payload, &payload); err == nil {
				resp, err = s.client.SendHeartbeat(ctx, &payload)
			}
		case "/agent/metrics":
			var payload interface{}
			if err = json.Unmarshal(item.Payload, &payload); err == nil {
				resp, err = s.client.SendMetrics(ctx, payload)
			}
		case "/agent/inventory":
			var payload interface{}
			if err = json.Unmarshal(item.Payload, &payload); err == nil {
				resp, err = s.client.SendInventory(ctx, payload)
			}
		case "/agent/software":
			var payload interface{}
			if err = json.Unmarshal(item.Payload, &payload); err == nil {
				resp, err = s.client.SendSoftware(ctx, payload)
			}
		case "/agent/patches/report":
			var payload interface{}
			if err = json.Unmarshal(item.Payload, &payload); err == nil {
				resp, err = s.client.SendPatchReport(ctx, payload)
			}
		default:
			s.logger.Error("unknown offline buffer endpoint; preserving item for diagnosis",
				"endpoint", item.Endpoint,
				"item_id", item.ID,
			)
			return
		}

		// Check for transient network error or server 5xx/429
		if err != nil || (resp != nil && (resp.StatusCode >= 500 || resp.StatusCode == 429)) {
			s.logger.Warn("offline buffer delivery failed (network/server busy), pausing drain until next tick",
				"endpoint", item.Endpoint,
				"error", err,
			)
			return
		}

		// Check for permanent rejection (4xx client error, e.g. invalid payload format or unprocessable entity)
		if resp != nil && resp.StatusCode >= 400 && resp.StatusCode < 500 {
			s.logger.Error("buffered item permanently rejected by server (4xx), removing from buffer to prevent stall",
				"endpoint", item.Endpoint,
				"status", resp.StatusCode,
			)
			_ = s.buffer.Remove(item.ID)
			continue
		}

		// Item delivered successfully, remove from buffer
		_ = s.buffer.Remove(item.ID)
		flushedCount++
	}

	s.logger.Info("offline buffer drain completed", "items_flushed", flushedCount, "remaining", s.buffer.Len())
}

// ==================== SchedTriggerHook Implementation ====================

// TriggerHeartbeat immediately executes heartbeat/security and confirms CRM delivery.
func (s *Scheduler) TriggerHeartbeat(ctx context.Context) error {
	s.logger.Info("remotely triggered: executing immediate heartbeat and security check")
	return s.collectAndSendHeartbeatAndSecurityConfirmed(ctx)
}

// TriggerMetrics immediately executes performance metrics collection and confirms CRM delivery.
func (s *Scheduler) TriggerMetrics(ctx context.Context) error {
	s.logger.Info("remotely triggered: executing immediate metrics collection")
	return s.collectAndSendMetricsConfirmed(ctx)
}

// TriggerSecurity immediately refreshes security posture through an authoritative heartbeat.
func (s *Scheduler) TriggerSecurity(ctx context.Context) error {
	s.logger.Info("remotely triggered: executing immediate security posture check")
	return s.collectAndSendHeartbeatAndSecurityConfirmed(ctx)
}

// TriggerInventory immediately executes hardware and software inventory.
// Both sides must be confirmed for the remote action to report SUCCESS.
func (s *Scheduler) TriggerInventory(ctx context.Context) error {
	s.logger.Info("remotely triggered: executing immediate hardware and software inventory")
	if err := s.collectAndSendInventoryConfirmed(ctx); err != nil {
		return err
	}
	return s.collectAndSendSoftwareConfirmed(ctx)
}

// TriggerSmart immediately executes physical disk SMART health check.
func (s *Scheduler) TriggerSmart(ctx context.Context) error {
	s.logger.Info("remotely triggered: executing immediate SMART disk check")
	return s.collectAndSendSmartConfirmed(ctx)
}

// TriggerWindowsUpdate is used as a post-action refresh. It remains best-effort;
// authoritative manual scan actions use ReportPatches and verify its ACK directly.
func (s *Scheduler) TriggerWindowsUpdate(ctx context.Context) {
	s.logger.Info("remotely triggered: executing immediate Windows Update inspection")
	s.collectAndSendWindowsUpdate(ctx)
}
