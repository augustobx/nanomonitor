package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

const pendingActionReportFile = "pending_action_report.json"

type pendingActionReport struct {
	ActionID string                        `json:"actionId"`
	Report   *transport.ActionStatusReport `json:"report"`
}

// Poller continuously polls for remote actions from NanoMonitor using outbound long-polling.
type Poller struct {
	client *transport.Client
	logger *slog.Logger
	hook   SchedTriggerHook
}

func NewPoller(client *transport.Client, logger *slog.Logger, hook SchedTriggerHook) *Poller {
	return &Poller{
		client: client,
		logger: logger,
		hook:   hook,
	}
}

// Run starts the polling loop and blocks until context is cancelled.
func (p *Poller) Run(ctx context.Context) {
	localContractHash := ActionContractHash()
	p.logger.Info("remote actions poller started (outbound long-poll model)",
		"action_contract_hash", localContractHash,
	)

	backoff := 5 * time.Second

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("remote actions poller stopped")
			return
		default:
		}

		// A completed action result is flushed before accepting more work.
		if err := p.flushPendingFinalReport(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			p.logger.Warn("pending action result still not acknowledged; delaying new actions",
				"error", err,
				"backoff", backoff.String(),
			)
			if !sleepWithContext(ctx, backoff) {
				return
			}
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			continue
		}

		actions, serverContractHash, err := p.client.PollActions(ctx, 20)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			p.logger.Debug("polling actions connection error, backing off",
				"error", err,
				"backoff", backoff.String(),
			)
			if !sleepWithContext(ctx, backoff) {
				return
			}
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			continue
		}

		if serverContractHash == "" || serverContractHash != localContractHash {
			p.logger.Error("ACTION CONTRACT MISMATCH: refusing remote action execution",
				"agent_contract_hash", localContractHash,
				"server_contract_hash", serverContractHash,
			)
			if !sleepWithContext(ctx, 10*time.Second) {
				return
			}
			continue
		}

		backoff = 5 * time.Second

		if len(actions) == 0 {
			if !sleepWithContext(ctx, time.Second) {
				return
			}
			continue
		}

		for _, action := range actions {
			select {
			case <-ctx.Done():
				return
			default:
			}

			if !p.processAction(ctx, &action) {
				break
			}
		}
	}
}

// processAction returns true only when it is safe to accept another action.
func (p *Poller) processAction(ctx context.Context, action *transport.ActionItem) bool {
	p.logger.Info("received remote action for execution",
		"action_id", action.ID,
		"action_type", action.ActionType,
		"requested_by", action.RequestedBy,
	)

	if IsActionExpired(action) {
		p.logger.Warn("action arrived but is already expired, discarding", "action_id", action.ID)
		report := &transport.ActionStatusReport{
			Status:     ActionStatusFailed,
			FinishedAt: time.Now().UTC().Format(time.RFC3339),
			Error:      "La acción expiró antes de poder ejecutarse en el agente.",
		}
		if err := p.persistFinalReport(action.ID, report); err != nil {
			p.logger.Error("failed to persist expired action result", "error", err)
			return false
		}
		return p.flushPendingFinalReport(ctx) == nil
	}

	// Claim execution at the application level. If RUNNING cannot be acknowledged,
	// do not perform the local side effect; the server delivery lease will retry it.
	startedAt := time.Now().UTC().Format(time.RFC3339)
	runningReport := &transport.ActionStatusReport{
		Status:    ActionStatusRunning,
		StartedAt: startedAt,
	}
	if err := p.reportWithRetry(ctx, action.ID, runningReport, 3); err != nil {
		p.logger.Warn("RUNNING status was not acknowledged; action will not execute yet",
			"action_id", action.ID,
			"error", err,
		)
		return false
	}

	_ = PublishActionStart(action)
	result := ExecuteAction(ctx, action, p.hook)
	_ = PublishActionEnd(action.ID, action.ActionType, result.ExitCode, result.Error)

	status := ActionStatusSuccess
	if result.ExitCode != 0 || result.Error != "" {
		status = ActionStatusFailed
	}

	finalReport := &transport.ActionStatusReport{
		Status:     status,
		StartedAt:  startedAt,
		FinishedAt: time.Now().UTC().Format(time.RFC3339),
		ExitCode:   &result.ExitCode,
		Output:     result.Output,
		Error:      result.Error,
		Result:     result.Result,
	}

	// Persist before network transmission so a service restart or network outage
	// cannot lose the final outcome after the local action already executed.
	if err := p.persistFinalReport(action.ID, finalReport); err != nil {
		p.logger.Error("action completed but final result could not be persisted",
			"action_id", action.ID,
			"error", err,
		)
		return false
	}

	p.logger.Info("action completed, reporting result to server",
		"action_id", action.ID,
		"status", status,
		"exit_code", result.ExitCode,
	)

	if err := p.flushPendingFinalReport(ctx); err != nil {
		p.logger.Error("action completed; final result saved locally for retry",
			"action_id", action.ID,
			"error", err,
		)
		return false
	}

	// Patch state must be refreshed only after the server has accepted the
	// terminal action result, otherwise a fresh scan races with INSTALLING.
	if p.hook != nil &&
		(action.ActionType == "WINDOWS_UPDATE_INSTALL_KB" ||
			action.ActionType == "WINDOWS_UPDATE_INSTALL_APPROVED") {
		p.hook.TriggerWindowsUpdate(ctx)
	}

	return true
}

func (p *Poller) reportWithRetry(
	ctx context.Context,
	actionID string,
	report *transport.ActionStatusReport,
	maxRetries int,
) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(1<<uint(attempt-1)) * time.Second
			if delay > 15*time.Second {
				delay = 15 * time.Second
			}
			if !sleepWithContext(ctx, delay) {
				return ctx.Err()
			}
		}

		if err := p.client.ReportActionStatus(ctx, actionID, report); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	return fmt.Errorf("status report retries exhausted: %w", lastErr)
}

func (p *Poller) pendingReportPath() string {
	return filepath.Join(config.DefaultConfigDir, pendingActionReportFile)
}

func (p *Poller) persistFinalReport(actionID string, report *transport.ActionStatusReport) error {
	pending := pendingActionReport{ActionID: actionID, Report: report}
	data, err := json.Marshal(pending)
	if err != nil {
		return fmt.Errorf("marshaling pending action report: %w", err)
	}

	path := p.pendingReportPath()
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("writing pending action report: %w", err)
	}
	_ = os.Remove(path)
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("committing pending action report: %w", err)
	}
	return nil
}

func (p *Poller) flushPendingFinalReport(ctx context.Context) error {
	path := p.pendingReportPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("reading pending action report: %w", err)
	}

	var pending pendingActionReport
	if err := json.Unmarshal(data, &pending); err != nil {
		return fmt.Errorf("parsing pending action report: %w", err)
	}
	if pending.ActionID == "" || pending.Report == nil {
		return fmt.Errorf("pending action report is incomplete")
	}

	if err := p.reportWithRetry(ctx, pending.ActionID, pending.Report, 3); err != nil {
		return err
	}

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing acknowledged action report: %w", err)
	}

	p.logger.Info("pending action result acknowledged by server",
		"action_id", pending.ActionID,
		"status", pending.Report.Status,
	)
	return nil
}

func sleepWithContext(ctx context.Context, delay time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(delay):
		return true
	}
}
