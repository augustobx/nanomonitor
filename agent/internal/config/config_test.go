package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.HeartbeatInterval != 180 {
		t.Errorf("expected heartbeat interval 180, got %d", cfg.HeartbeatInterval)
	}
	if cfg.SecurityInterval != 180 {
		t.Errorf("expected security interval 180, got %d", cfg.SecurityInterval)
	}
	if cfg.MetricsInterval != 300 {
		t.Errorf("expected metrics interval 300, got %d", cfg.MetricsInterval)
	}
	if cfg.SmartInterval != 3600 {
		t.Errorf("expected smart interval 3600, got %d", cfg.SmartInterval)
	}
	if cfg.WindowsUpdateInterval != 14400 {
		t.Errorf("expected windows update interval 14400, got %d", cfg.WindowsUpdateInterval)
	}
	if cfg.InventoryInterval != 86400 {
		t.Errorf("expected inventory interval 86400, got %d", cfg.InventoryInterval)
	}
	if cfg.EventCheckInterval != 60 {
		t.Errorf("expected event check interval 60, got %d", cfg.EventCheckInterval)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("expected log level 'info', got %s", cfg.LogLevel)
	}
	if cfg.BufferMaxSizeMB != 10 {
		t.Errorf("expected buffer max size 10, got %d", cfg.BufferMaxSizeMB)
	}
}

func TestIsEnrolled(t *testing.T) {
	tests := []struct {
		name     string
		agentID  string
		deviceID string
		tenantID string
		expected bool
	}{
		{"not enrolled - all empty", "", "", "", false},
		{"not enrolled - partial", "agent-1", "", "", false},
		{"not enrolled - partial 2", "agent-1", "device-1", "", false},
		{"enrolled", "agent-1", "device-1", "tenant-1", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := DefaultConfig()
			cfg.AgentID = tc.agentID
			cfg.DeviceID = tc.deviceID
			cfg.TenantID = tc.tenantID

			if result := cfg.IsEnrolled(); result != tc.expected {
				t.Errorf("expected IsEnrolled=%v, got %v", tc.expected, result)
			}
		})
	}
}

func TestSetIdentity(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.IsEnrolled() {
		t.Fatal("should not be enrolled initially")
	}

	cfg.SetIdentity("agent-123", "device-456", "tenant-789")

	if !cfg.IsEnrolled() {
		t.Fatal("should be enrolled after SetIdentity")
	}
	if cfg.AgentID != "agent-123" {
		t.Errorf("expected agent-123, got %s", cfg.AgentID)
	}
	if cfg.DeviceID != "device-456" {
		t.Errorf("expected device-456, got %s", cfg.DeviceID)
	}
	if cfg.TenantID != "tenant-789" {
		t.Errorf("expected tenant-789, got %s", cfg.TenantID)
	}
}

func TestSaveAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "test-config.yaml")

	// Create and save config
	cfg := DefaultConfig()
	cfg.AgentID = "test-agent"
	cfg.DeviceID = "test-device"
	cfg.TenantID = "test-tenant"
	cfg.APIUrl = "https://test.example.com/api"
	cfg.HeartbeatInterval = 60

	if err := cfg.SaveToFile(configPath); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	// Verify file exists with restricted permissions
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("config file not found: %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("config file is empty")
	}

	// Load and verify
	loaded, err := LoadFromFile(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if loaded.AgentID != "test-agent" {
		t.Errorf("expected agent 'test-agent', got %s", loaded.AgentID)
	}
	if loaded.APIUrl != "https://test.example.com/api" {
		t.Errorf("expected API URL, got %s", loaded.APIUrl)
	}
	if loaded.HeartbeatInterval != 60 {
		t.Errorf("expected heartbeat 60, got %d", loaded.HeartbeatInterval)
	}
}

func TestLoadNonExistentFile(t *testing.T) {
	cfg, err := LoadFromFile("/nonexistent/path/config.yaml")
	if err != nil {
		t.Fatalf("should return defaults for non-existent file, got error: %v", err)
	}
	if cfg.HeartbeatInterval != 180 {
		t.Errorf("expected default heartbeat 180, got %d", cfg.HeartbeatInterval)
	}
}
