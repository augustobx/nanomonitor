package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

const (
	// DefaultConfigDir is the base directory for agent configuration
	DefaultConfigDir = `C:\ProgramData\NanoLabs\NanoMonitor`
	// DefaultConfigFile is the configuration filename
	DefaultConfigFile = "config.yaml"
	// DefaultLogDir is the directory for agent logs
	DefaultLogDir = `C:\ProgramData\NanoLabs\NanoMonitor\logs`
)

// Config holds the agent's runtime configuration
type Config struct {
	mu sync.RWMutex

	// Server connection
	APIUrl    string `yaml:"apiUrl"`
	APIUrlAlt string `yaml:"api_url,omitempty"`

	// Agent identity (set during enrollment)
	AgentID  string `yaml:"agentId,omitempty"`
	DeviceID string `yaml:"deviceId,omitempty"`
	TenantID string `yaml:"tenantId,omitempty"`

	// Agent secret is stored separately with DPAPI when available
	// This field is only used during initial enrollment
	AgentSecret string `yaml:"agentSecret,omitempty"`

	// Intervals (in seconds)
	HeartbeatInterval     int `yaml:"heartbeatInterval"`
	SecurityInterval      int `yaml:"securityInterval"`
	MetricsInterval       int `yaml:"metricsInterval"`
	SmartInterval         int `yaml:"smartInterval"`
	WindowsUpdateInterval int `yaml:"windowsUpdateInterval"`
	InventoryInterval     int `yaml:"inventoryInterval"`
	EventCheckInterval    int `yaml:"eventCheckInterval"`

	// Logging
	LogLevel string `yaml:"logLevel"`
	LogFile  string `yaml:"logFile"`

	// Buffer
	BufferDBPath    string `yaml:"bufferDbPath"`
	BufferMaxSizeMB int    `yaml:"bufferMaxSizeMb"`
}

// DefaultConfig returns a Config with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		APIUrl:                "https://monitor.nanolabs.com.ar",
		HeartbeatInterval:     180,   // 3 minutes
		SecurityInterval:      180,   // 3 minutes (coupled with heartbeat)
		MetricsInterval:       300,   // 5 minutes
		SmartInterval:         3600,  // 1 hour
		WindowsUpdateInterval: 14400, // 4 hours
		InventoryInterval:     86400, // 24 hours
		EventCheckInterval:    60,    // 1 minute
		LogLevel:              "info",
		LogFile:               filepath.Join(DefaultLogDir, "agent.log"),
		BufferDBPath:          filepath.Join(DefaultConfigDir, "buffer.db"),
		BufferMaxSizeMB:       10,
	}
}

// Load reads the configuration from the default config file
func Load() (*Config, error) {
	return LoadFromFile(filepath.Join(DefaultConfigDir, DefaultConfigFile))
}

// LoadFromFile reads configuration from a specific file path
func LoadFromFile(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil // Return defaults if no config file
		}
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	if cfg.APIUrlAlt != "" && (cfg.APIUrl == "" || cfg.APIUrl == "https://control-api.nanoapps.site/api") {
		cfg.APIUrl = cfg.APIUrlAlt
	}

	return cfg, nil
}

// Save writes the current configuration to the default config file
func (c *Config) Save() error {
	return c.SaveToFile(filepath.Join(DefaultConfigDir, DefaultConfigFile))
}

// SaveToFile writes configuration to a specific file path
func (c *Config) SaveToFile(path string) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}

	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("marshaling config: %w", err)
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("writing config file: %w", err)
	}

	return nil
}

// IsEnrolled returns true if the agent has been enrolled
func (c *Config) IsEnrolled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.AgentID != "" && c.DeviceID != "" && c.TenantID != ""
}

// SetIdentity updates the agent's identity after enrollment
func (c *Config) SetIdentity(agentID, deviceID, tenantID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.AgentID = agentID
	c.DeviceID = deviceID
	c.TenantID = tenantID
}
