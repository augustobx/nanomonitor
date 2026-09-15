package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	// ServiceName is the Windows service name
	ServiceName = "NanoLabsAgent"
	// ServiceDisplayName is the human-readable service name
	ServiceDisplayName = "NanoLabs Agent"
	// ServiceDescription is the service description
	ServiceDescription = "NanoLabs Control Center monitoring agent. Collects system telemetry and reports to NanoLabs."
)

// RunFunc is the function signature for the main agent loop
type RunFunc func(ctx context.Context) error

// AgentService implements the Windows service interface
type AgentService struct {
	run    RunFunc
	logger *slog.Logger
}

// NewAgentService creates a new AgentService
func NewAgentService(run RunFunc, logger *slog.Logger) *AgentService {
	return &AgentService{
		run:    run,
		logger: logger,
	}
}

// Execute implements the svc.Handler interface for Windows Service Control Manager
func (s *AgentService) Execute(args []string, req <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	const acceptedCmds = svc.AcceptStop | svc.AcceptShutdown

	status <- svc.Status{State: svc.StartPending}
	s.logger.Info("service starting")

	// Create a cancellable context for the agent loop
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run the agent in a goroutine
	errCh := make(chan error, 1)
	go func() {
		errCh <- s.run(ctx)
	}()

	status <- svc.Status{State: svc.Running, Accepts: acceptedCmds}
	s.logger.Info("service running")

	// Wait for stop signal or agent error
	for {
		select {
		case err := <-errCh:
			if err != nil {
				s.logger.Error("agent loop error", "error", err)
				return false, 1
			}
			s.logger.Info("agent loop exited cleanly")
			return false, 0

		case c := <-req:
			switch c.Cmd {
			case svc.Stop, svc.Shutdown:
				s.logger.Info("service stop requested", "cmd", c.Cmd)
				status <- svc.Status{State: svc.StopPending}
				cancel()

				// Wait for graceful shutdown with timeout
				select {
				case <-errCh:
				case <-time.After(30 * time.Second):
					s.logger.Warn("graceful shutdown timed out")
				}

				return false, 0

			case svc.Interrogate:
				status <- c.CurrentStatus

			default:
				s.logger.Warn("unexpected service control request", "cmd", c.Cmd)
			}
		}
	}
}

// Install installs the agent as a Windows service
func Install(execPath string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connecting to service manager: %w", err)
	}
	defer m.Disconnect()

	// Check if already installed
	s, err := m.OpenService(ServiceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", ServiceName)
	}

	s, err = m.CreateService(ServiceName, execPath, mgr.Config{
		DisplayName:  ServiceDisplayName,
		Description:  ServiceDescription,
		StartType:    mgr.StartAutomatic,
		ErrorControl: mgr.ErrorNormal,
	})
	if err != nil {
		return fmt.Errorf("creating service: %w", err)
	}
	defer s.Close()

	// Set recovery actions: restart after 1 min, 5 min, 30 min
	err = s.SetRecoveryActions([]mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 1 * time.Minute},
		{Type: mgr.ServiceRestart, Delay: 5 * time.Minute},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Minute},
	}, 86400) // Reset failure count after 24 hours
	if err != nil {
		return fmt.Errorf("setting recovery actions: %w", err)
	}

	return nil
}

// Uninstall removes the Windows service
func Uninstall() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connecting to service manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("opening service: %w", err)
	}
	defer s.Close()

	err = s.Delete()
	if err != nil {
		return fmt.Errorf("deleting service: %w", err)
	}

	return nil
}

// IsRunningAsService checks if the process is running as a Windows service
func IsRunningAsService() bool {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return isService
}

// Start starts the service
func Start() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connecting to service manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("opening service: %w", err)
	}
	defer s.Close()

	return s.Start()
}
