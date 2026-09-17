package actions

import (
	"context"
	"log/slog"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

// Poller continuously polls for remote actions from NanoMonitor using outbound long-polling
type Poller struct {
	client *transport.Client
	logger *slog.Logger
	hook   SchedTriggerHook
}

// NewPoller creates a new remote action poller
func NewPoller(client *transport.Client, logger *slog.Logger, hook SchedTriggerHook) *Poller {
	return &Poller{
		client: client,
		logger: logger,
		hook:   hook,
	}
}

// Run starts the polling loop and blocks until context is cancelled
func (p *Poller) Run(ctx context.Context) {
	p.logger.Info("remote actions poller started (outbound long-poll model)")

	var backoff time.Duration = 5 * time.Second

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("remote actions poller stopped")
			return
		default:
		}

		// Long poll with 20 second hold timeout on the server
		actions, err := p.client.PollActions(ctx, 20)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			p.logger.Debug("polling actions connection error, backing off",
				"error", err,
				"backoff", backoff.String(),
			)

			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}

			// Exponential backoff capped at 30s
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			continue
		}

		// Reset backoff on successful HTTP roundtrip
		backoff = 5 * time.Second

		if len(actions) == 0 {
			// Small idle sleep before next long poll to prevent spinning
			select {
			case <-ctx.Done():
				return
			case <-time.After(1 * time.Second):
			}
			continue
		}

		// Process each received action
		for _, action := range actions {
			select {
			case <-ctx.Done():
				return
			default:
			}

			p.processAction(ctx, &action)
		}
	}
}

func (p *Poller) processAction(ctx context.Context, action *transport.ActionItem) {
	p.logger.Info("received remote action for execution",
		"action_id", action.ID,
		"action_type", action.ActionType,
		"requested_by", action.RequestedBy,
	)

	// Check if already expired
	if IsActionExpired(action) {
		p.logger.Warn("action arrived but is already expired, discarding", "action_id", action.ID)
		report := &transport.ActionStatusReport{
			Status:     "FAILED",
			FinishedAt: time.Now().UTC().Format(time.RFC3339),
			Error:      "La acción expiró antes de poder ejecutarse en el agente.",
		}
		_ = p.client.ReportActionStatus(ctx, action.ID, report)
		return
	}

	// 1. Report RUNNING status
	startedAt := time.Now().UTC().Format(time.RFC3339)
	runningReport := &transport.ActionStatusReport{
		Status:    "RUNNING",
		StartedAt: startedAt,
	}
	if err := p.client.ReportActionStatus(ctx, action.ID, runningReport); err != nil {
		p.logger.Warn("failed to report RUNNING status to server", "error", err)
	}

	// Publish action start to local IPC state file for nanotray notifications
	_ = PublishActionStart(action)

	// 2. Execute local action
	result := ExecuteAction(ctx, action, p.hook)

	// Publish action end to local IPC state file
	_ = PublishActionEnd(action.ID, action.ActionType, result.ExitCode, result.Error)

	// 3. Report final outcome
	finishedAt := time.Now().UTC().Format(time.RFC3339)
	status := "SUCCESS"
	if result.ExitCode != 0 || result.Error != "" {
		status = "FAILED"
	}

	finalReport := &transport.ActionStatusReport{
		Status:     status,
		StartedAt:  startedAt,
		FinishedAt: finishedAt,
		ExitCode:   &result.ExitCode,
		Output:     result.Output,
		Error:      result.Error,
		Result:     result.Result,
	}

	p.logger.Info("action completed, reporting result to server",
		"action_id", action.ID,
		"status", status,
		"exit_code", result.ExitCode,
	)

	if err := p.client.ReportActionStatus(ctx, action.ID, finalReport); err != nil {
		p.logger.Error("failed to report action completion to server", "error", err)
	}
}
