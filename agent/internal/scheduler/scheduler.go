package scheduler

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

// Scheduler manages the tick loops for different data collection types
type Scheduler struct {
	cfg       *config.Config
	client    *transport.Client
	logger    *slog.Logger
	wg        sync.WaitGroup

	// State tracking
	lastInventoryChecksum string
	lastSoftwareChecksum  string
	lastSoftwareItems     []collector.SoftwareItem
}

// New creates a new Scheduler
func New(cfg *config.Config, client *transport.Client, logger *slog.Logger) *Scheduler {
	return &Scheduler{
		cfg:    cfg,
		client: client,
		logger: logger,
	}
}

// Run starts all scheduled collection loops and blocks until ctx is cancelled
func (s *Scheduler) Run(ctx context.Context) error {
	s.logger.Info("scheduler starting",
		"heartbeat_interval", s.cfg.HeartbeatInterval,
		"metrics_interval", s.cfg.MetricsInterval,
		"inventory_interval", s.cfg.InventoryInterval,
	)

	// Run initial inventory and software immediately
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.collectAndSendInventory(ctx)
		s.collectAndSendSoftware(ctx)
	}()

	// Start heartbeat loop
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoop(ctx, "heartbeat", time.Duration(s.cfg.HeartbeatInterval)*time.Second, s.collectAndSendHeartbeat)
	}()

	// Start metrics loop
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoop(ctx, "metrics", time.Duration(s.cfg.MetricsInterval)*time.Second, s.collectAndSendMetrics)
	}()

	// Start inventory loop (includes security, storage, windows update, software)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoop(ctx, "inventory", time.Duration(s.cfg.InventoryInterval)*time.Second, func(ctx context.Context) {
			s.collectAndSendInventory(ctx)
			s.collectAndSendSoftware(ctx)
		})
	}()

	// Wait for all loops to finish
	<-ctx.Done()
	s.wg.Wait()
	s.logger.Info("scheduler stopped")
	return nil
}

// runLoop runs a collection function on a ticker interval
func (s *Scheduler) runLoop(ctx context.Context, name string, interval time.Duration, fn func(ctx context.Context)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	s.logger.Info("loop started", "name", name, "interval", interval.String())

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("loop stopping", "name", name)
			return
		case <-ticker.C:
			fn(ctx)
		}
	}
}

func (s *Scheduler) collectAndSendHeartbeat(ctx context.Context) {
	log := s.logger.With("task", "heartbeat")

	perf, err := collector.CollectPerformance()
	if err != nil {
		log.Error("failed to collect performance for heartbeat", "error", err)
		return
	}

	payload := &transport.HeartbeatPayload{
		AgentVersion:  version.Version,
		Timestamp:     perf.Timestamp,
		UptimeSeconds: perf.UptimeSecs,
		Status:        "healthy",
		CPUPercent:    perf.CPUPercent,
		RAMUsedMB:     perf.RAMUsedMB,
		RAMAvailMB:    perf.RAMAvailMB,
		DiskSummary:   perf.Volumes,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendHeartbeat(ctx, payload)
	}, 2)

	if err != nil {
		log.Warn("failed to send heartbeat", "error", err)
		// TODO: buffer for offline sending
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Debug("heartbeat sent",
			"cpu", perf.CPUPercent,
			"ram_used_mb", perf.RAMUsedMB,
			"uptime_s", perf.UptimeSecs,
		)
	} else {
		log.Warn("heartbeat rejected", "status", resp.StatusCode)
	}
}

func (s *Scheduler) collectAndSendMetrics(ctx context.Context) {
	log := s.logger.With("task", "metrics")

	perf, err := collector.CollectPerformance()
	if err != nil {
		log.Error("failed to collect metrics", "error", err)
		return
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendMetrics(ctx, perf)
	}, 2)

	if err != nil {
		log.Warn("failed to send metrics", "error", err)
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Debug("metrics sent",
			"cpu", perf.CPUPercent,
			"ram_percent", perf.RAMPercent,
			"volumes", len(perf.Volumes),
		)
	} else {
		log.Warn("metrics rejected", "status", resp.StatusCode)
	}
}

func (s *Scheduler) collectAndSendInventory(ctx context.Context) {
	log := s.logger.With("task", "inventory")

	// Collect all inventory data
	identity, err := collector.CollectIdentity()
	if err != nil {
		log.Error("failed to collect identity", "error", err)
	}

	hardware, err := collector.CollectHardware()
	if err != nil {
		log.Error("failed to collect hardware", "error", err)
	}

	network, err := collector.CollectNetwork()
	if err != nil {
		log.Error("failed to collect network", "error", err)
	}

	// Measure server latency
	if network != nil {
		network.ServerLatencyMs = collector.MeasureServerLatency(s.cfg.APIUrl)
	}

	// Security posture (AV, Defender, Firewall)
	security, err := collector.CollectSecurity()
	if err != nil {
		log.Error("failed to collect security posture", "error", err)
	}

	// Physical storage (NVMe/SSD/HDD, health, SMART)
	storage, err := collector.CollectStorage()
	if err != nil {
		log.Error("failed to collect storage inventory", "error", err)
	}

	// Windows update status & pending reboots
	windowsUpdate, err := collector.CollectWindowsUpdate()
	if err != nil {
		log.Error("failed to collect windows update status", "error", err)
	}

	payload := map[string]interface{}{
		"identity":      identity,
		"hardware":      hardware,
		"network":       network,
		"security":      security,
		"storage":       storage,
		"windowsUpdate": windowsUpdate,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendInventory(ctx, payload)
	}, 3)

	if err != nil {
		log.Warn("failed to send inventory", "error", err)
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Info("inventory sent successfully",
			"has_security", security != nil,
			"has_storage", storage != nil,
			"has_wu", windowsUpdate != nil,
		)
	} else {
		log.Warn("inventory rejected", "status", resp.StatusCode)
	}
}

func (s *Scheduler) collectAndSendSoftware(ctx context.Context) {
	log := s.logger.With("task", "software")

	sw, err := collector.CollectSoftware()
	if err != nil {
		log.Error("failed to collect software inventory", "error", err)
		return
	}

	// Check if software has changed since last sync
	if s.lastSoftwareChecksum == sw.Checksum && len(s.lastSoftwareItems) > 0 {
		log.Debug("software inventory unchanged, skipping upload", "count", sw.Count, "checksum", sw.Checksum)
		return
	}

	// Calculate delta
	changes := collector.ComputeSoftwareDelta(s.lastSoftwareItems, sw.Items)

	payload := map[string]interface{}{
		"checksum": sw.Checksum,
		"count":    sw.Count,
		"items":    sw.Items,
		"changes":  changes,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendSoftware(ctx, payload)
	}, 3)

	if err != nil {
		log.Warn("failed to send software inventory", "error", err)
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Info("software inventory sent successfully",
			"count", sw.Count,
			"changes", len(changes),
			"checksum", sw.Checksum,
		)
		// Update cache only on successful delivery
		s.lastSoftwareChecksum = sw.Checksum
		s.lastSoftwareItems = sw.Items
	} else {
		log.Warn("software inventory rejected", "status", resp.StatusCode)
	}
}
