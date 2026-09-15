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

	// Run initial inventory immediately
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.collectAndSendInventory(ctx)
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

	// Start inventory loop
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runLoop(ctx, "inventory", time.Duration(s.cfg.InventoryInterval)*time.Second, s.collectAndSendInventory)
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
		// Continue with partial data
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

	payload := map[string]interface{}{
		"identity": identity,
		"hardware": hardware,
		"network":  network,
	}

	resp, err := s.client.SendWithRetry(ctx, func(ctx context.Context) (*transport.Response, error) {
		return s.client.SendInventory(ctx, payload)
	}, 3)

	if err != nil {
		log.Warn("failed to send inventory", "error", err)
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Info("inventory sent successfully")
	} else {
		log.Warn("inventory rejected", "status", resp.StatusCode)
	}
}
