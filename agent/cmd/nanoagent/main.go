package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sys/windows/svc"

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
	"github.com/nanolabs/nanomonitor/agent/internal/config"
	"github.com/nanolabs/nanomonitor/agent/internal/logger"
	"github.com/nanolabs/nanomonitor/agent/internal/scheduler"
	agentsvc "github.com/nanolabs/nanomonitor/agent/internal/service"
	"github.com/nanolabs/nanomonitor/agent/internal/transport"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

func main() {
	// Parse command-line flags
	var (
		installFlag   = flag.Bool("install", false, "Install as Windows service")
		uninstallFlag = flag.Bool("uninstall", false, "Uninstall Windows service")
		startFlag     = flag.Bool("start", false, "Start the Windows service")
		versionFlag   = flag.Bool("version", false, "Print version and exit")
		tokenFlag     = flag.String("token", "", "Enrollment token for initial registration")
		apiURLFlag    = flag.String("api-url", "", "API server URL (overrides config)")
		configFlag    = flag.String("config", "", "Path to config file")
		silentFlag    = flag.Bool("silent", false, "Silent mode (for automated installation)")
	)
	flag.BoolVar(versionFlag, "v", false, "Print version and exit")
	flag.Parse()

	// Version
	if *versionFlag {
		fmt.Printf("NanoLabs Agent %s\n", version.Info())
		os.Exit(0)
	}

	// Install service
	if *installFlag {
		exePath, err := os.Executable()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error getting executable path: %v\n", err)
			os.Exit(1)
		}
		if err := agentsvc.Install(exePath); err != nil {
			fmt.Fprintf(os.Stderr, "Error installing service: %v\n", err)
			os.Exit(1)
		}
		if !*silentFlag {
			fmt.Println("Service installed successfully.")
		}

		// If token provided, save config and start enrollment
		if *tokenFlag != "" {
			cfg := config.DefaultConfig()
			if *apiURLFlag != "" {
				cfg.APIUrl = *apiURLFlag
			}
			if err := cfg.Save(); err != nil {
				fmt.Fprintf(os.Stderr, "Error saving config: %v\n", err)
				os.Exit(1)
			}
			// Enrollment will happen on first service start
			enrollTokenPath := filepath.Join(config.DefaultConfigDir, ".enrollment-token")
			if err := os.MkdirAll(config.DefaultConfigDir, 0750); err != nil {
				fmt.Fprintf(os.Stderr, "Error creating config dir: %v\n", err)
				os.Exit(1)
			}
			if err := os.WriteFile(enrollTokenPath, []byte(*tokenFlag), 0600); err != nil {
				fmt.Fprintf(os.Stderr, "Error saving enrollment token: %v\n", err)
				os.Exit(1)
			}
		}

		// Start the service if requested
		if *startFlag {
			if err := agentsvc.Start(); err != nil {
				fmt.Fprintf(os.Stderr, "Error starting service: %v\n", err)
				os.Exit(1)
			}
			if !*silentFlag {
				fmt.Println("Service started.")
			}
		}
		os.Exit(0)
	}

	// Uninstall service
	if *uninstallFlag {
		if err := agentsvc.Uninstall(); err != nil {
			fmt.Fprintf(os.Stderr, "Error uninstalling service: %v\n", err)
			os.Exit(1)
		}
		if !*silentFlag {
			fmt.Println("Service uninstalled successfully.")
		}
		os.Exit(0)
	}

	// Load configuration
	var cfg *config.Config
	var err error
	if *configFlag != "" {
		cfg, err = config.LoadFromFile(*configFlag)
	} else {
		cfg, err = config.Load()
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	if *apiURLFlag != "" {
		cfg.APIUrl = *apiURLFlag
	}

	// Initialize logger
	log, err := logger.New(cfg.LogFile, cfg.LogLevel)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating logger: %v\n", err)
		os.Exit(1)
	}
	defer log.Close()

	log.Info("NanoLabs Agent starting",
		"version", version.Info(),
		"enrolled", cfg.IsEnrolled(),
	)

	// Define the agent run function
	runAgent := func(ctx context.Context) error {
		return runAgentLoop(ctx, cfg, log)
	}

	// Check if running as Windows Service
	if agentsvc.IsRunningAsService() {
		log.Info("running as Windows Service")
		agentSvc := agentsvc.NewAgentService(runAgent, log.Logger)
		if err := svc.Run(agentsvc.ServiceName, agentSvc); err != nil {
			log.Error("service run failed", "error", err)
			os.Exit(1)
		}
	} else {
		// Running in console mode (for development/debugging)
		log.Info("running in console mode")
		ctx, cancel := context.WithCancel(context.Background())

		// Handle Ctrl+C
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			sig := <-sigCh
			log.Info("received signal", "signal", sig)
			cancel()
		}()

		if err := runAgent(ctx); err != nil {
			log.Error("agent error", "error", err)
			os.Exit(1)
		}
	}
}

// runAgentLoop is the main agent lifecycle
func runAgentLoop(ctx context.Context, cfg *config.Config, log *logger.Logger) error {
	// Handle enrollment if needed (with retry for boot-time network delays)
	if !cfg.IsEnrolled() {
		const maxRetries = 10
		var lastErr error
		for attempt := 1; attempt <= maxRetries; attempt++ {
			lastErr = handleEnrollment(ctx, cfg, log.Logger)
			if lastErr == nil {
				break
			}
			log.Warn("enrollment attempt failed, retrying",
				"attempt", attempt,
				"max_retries", maxRetries,
				"error", lastErr,
			)
			if attempt < maxRetries {
				// Exponential backoff: 5s, 10s, 20s, 40s ... capped at 60s
				delay := time.Duration(5*(1<<(attempt-1))) * time.Second
				if delay > 60*time.Second {
					delay = 60 * time.Second
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(delay):
				}
			}
		}
		if lastErr != nil {
			return fmt.Errorf("enrollment failed after %d attempts: %w", maxRetries, lastErr)
		}
	}

	// Create transport client
	client := transport.NewClient(
		cfg.APIUrl,
		cfg.AgentID,
		cfg.AgentSecret,
		log.WithComponent("transport"),
	)

	// Create and run scheduler
	sched := scheduler.New(cfg, client, log.WithComponent("scheduler"))
	return sched.Run(ctx)
}

// handleEnrollment checks for a pending enrollment token and performs enrollment
func handleEnrollment(ctx context.Context, cfg *config.Config, log *slog.Logger) error {
	tokenPath := filepath.Join(config.DefaultConfigDir, ".enrollment-token")
	tokenBytes, err := os.ReadFile(tokenPath)
	if err != nil {
		return fmt.Errorf("no enrollment token found at %s: %w (run with -install -token=XXX first)", tokenPath, err)
	}
	token := string(tokenBytes)

	log.Info("starting enrollment", "api_url", cfg.APIUrl)

	// Create a temporary transport client without agent credentials
	client := transport.NewClient(cfg.APIUrl, "", "", log)

	// Collect identity for enrollment
	hostname, _ := os.Hostname()
	ident, _ := collector.CollectIdentity()
	var osInfo map[string]interface{}
	var hardwareID string
	if ident != nil {
		hardwareID = ident.MachineGUID
		osInfo = map[string]interface{}{
			"caption":        ident.OSEdition,
			"version":        ident.OSVersion,
			"buildNumber":    ident.OSBuild,
			"osArchitecture": ident.Architecture,
			"serialNumber":   ident.SerialNumber,
			"manufacturer":   ident.Manufacturer,
			"model":          ident.Model,
		}
	} else {
		osInfo = map[string]interface{}{
			"caption": "Windows",
		}
	}

	enrollReq := &transport.EnrollRequest{
		Token:        token,
		Hostname:     hostname,
		HardwareID:   hardwareID,
		AgentVersion: version.Version,
		OSInfo:       osInfo,
	}

	resp, err := client.Enroll(ctx, enrollReq)
	if err != nil {
		return fmt.Errorf("enrollment request failed: %w", err)
	}

	// Save the received credentials
	cfg.SetIdentity(resp.AgentID, resp.DeviceID, resp.TenantID)
	cfg.AgentSecret = resp.AgentSecret

	if err := cfg.Save(); err != nil {
		return fmt.Errorf("saving config after enrollment: %w", err)
	}

	// Remove the enrollment token file
	if err := os.Remove(tokenPath); err != nil {
		log.Warn("failed to remove enrollment token file", "error", err)
	}

	log.Info("enrollment successful",
		"agent_id", resp.AgentID,
		"device_id", resp.DeviceID,
		"tenant_id", resp.TenantID,
	)

	return nil
}
