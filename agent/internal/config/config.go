package config

import (
	"fmt"
	"encoding/json"
	"os"
	"os/exec"
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
	// ProtectedSecretsFile stores credentials readable only by SYSTEM/Administrators.
	ProtectedSecretsFile = "agent.secrets.json"
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

	// Sensitive values are never serialized into the public YAML.
	AgentSecret string `yaml:"-"`
	TamperKey   string `yaml:"-"`

	// Public state needed by the tray; the actual key remains protected.
	TamperProtectionEnabled bool `yaml:"tamperProtectionEnabled,omitempty"`

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

	// Load credentials from the protected sidecar. During upgrade from <=1.4.0,
	// migrate legacy secrets that were stored in config.yaml.
	if err := cfg.loadProtectedSecrets(filepath.Dir(path)); err != nil {
		var legacy struct {
			AgentSecret string `yaml:"agentSecret"`
			TamperKey   string `yaml:"tamperKey"`
		}
		if legacyErr := yaml.Unmarshal(data, &legacy); legacyErr == nil {
			cfg.AgentSecret = legacy.AgentSecret
			cfg.TamperKey = legacy.TamperKey
			cfg.TamperProtectionEnabled = legacy.TamperKey != ""
			if cfg.AgentSecret != "" || cfg.TamperKey != "" {
				if saveErr := cfg.saveProtectedSecrets(filepath.Dir(path)); saveErr != nil {
					return nil, fmt.Errorf("migrating protected agent secrets: %w", saveErr)
				}
				// Re-save public YAML to remove legacy clear-text secrets.
				if publicData, marshalErr := yaml.Marshal(cfg); marshalErr == nil {
					_ = os.WriteFile(path, publicData, 0640)
				}
			}
		}
	}

	if cfg.TamperKey != "" {
		cfg.TamperProtectionEnabled = true
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

	if err := os.WriteFile(path, data, 0640); err != nil {
		return fmt.Errorf("writing config file: %w", err)
	}

	if err := c.saveProtectedSecrets(filepath.Dir(path)); err != nil {
		return fmt.Errorf("writing protected secrets: %w", err)
	}

	return nil
}

type protectedSecrets struct {
	AgentSecret string `json:"agentSecret,omitempty"`
	TamperKey   string `json:"tamperKey,omitempty"`
}

func (c *Config) loadProtectedSecrets(dir string) error {
	path := filepath.Join(dir, ProtectedSecretsFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var secrets protectedSecrets
	if err := json.Unmarshal(data, &secrets); err != nil {
		return err
	}
	c.AgentSecret = secrets.AgentSecret
	c.TamperKey = secrets.TamperKey
	return nil
}

func (c *Config) saveProtectedSecrets(dir string) error {
	if c.AgentSecret == "" && c.TamperKey == "" {
		return nil
	}

	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	path := filepath.Join(dir, ProtectedSecretsFile)
	data, err := json.Marshal(protectedSecrets{
		AgentSecret: c.AgentSecret,
		TamperKey:   c.TamperKey,
	})
	if err != nil {
		return err
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}

	return protectSecretsACL(path)
}

func protectSecretsACL(path string) error {
	// Stable SIDs avoid localized Windows group names.
	cmd := exec.Command(
		"icacls.exe",
		path,
		"/inheritance:r",
		"/grant:r",
		"*S-1-5-18:F",
		"*S-1-5-32-544:F",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("protecting secret ACL: %w (%s)", err, string(out))
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
