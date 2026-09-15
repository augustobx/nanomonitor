package collector

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// NetworkInfo contains network configuration and connectivity data
type NetworkInfo struct {
	Interfaces        []NetworkInterface `json:"interfaces"`
	InternetReachable bool               `json:"internetReachable"`
	ServerLatencyMs   int                `json:"serverLatencyMs,omitempty"`
}

// NetworkInterface contains per-interface network information
type NetworkInterface struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	MACAddress  string   `json:"macAddress,omitempty"`
	IPAddresses []string `json:"ipAddresses,omitempty"`
	Gateway     string   `json:"gateway,omitempty"`
	DNSServers  []string `json:"dnsServers,omitempty"`
	DHCP        bool     `json:"dhcp"`
	Speed       string   `json:"speed,omitempty"`
	Status      string   `json:"status"`
}

// WMI structs for network

type Win32_NetworkAdapterConfiguration struct {
	Description    string
	MACAddress     string
	IPAddress      []string
	DefaultIPGateway []string
	DNSServerSearchOrder []string
	DHCPEnabled    bool
	Index          uint32
	IPEnabled      bool
}

type Win32_NetworkAdapter struct {
	Name        string
	NetConnectionStatus uint16
	Speed       uint64
	Index       uint32
}

// CollectNetwork gathers network information
func CollectNetwork() (*NetworkInfo, error) {
	info := &NetworkInfo{}

	// Get network adapter configurations via WMI
	var configs []Win32_NetworkAdapterConfiguration
	err := wmi.Query(
		"SELECT Description, MACAddress, IPAddress, DefaultIPGateway, DNSServerSearchOrder, DHCPEnabled, Index, IPEnabled FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE",
		&configs,
	)
	if err != nil {
		return nil, fmt.Errorf("querying network config: %w", err)
	}

	// Get adapter status info
	var adapters []Win32_NetworkAdapter
	_ = wmi.Query(
		"SELECT Name, NetConnectionStatus, Speed, Index FROM Win32_NetworkAdapter",
		&adapters,
	)

	// Index adapters by Index for lookup
	adapterMap := make(map[uint32]Win32_NetworkAdapter)
	for _, a := range adapters {
		adapterMap[a.Index] = a
	}

	for _, cfg := range configs {
		iface := NetworkInterface{
			Name:        cfg.Description,
			Description: cfg.Description,
			MACAddress:  cfg.MACAddress,
			DHCP:        cfg.DHCPEnabled,
		}

		// IP addresses (filter to IPv4 only for simplicity)
		for _, ip := range cfg.IPAddress {
			if net.ParseIP(ip) != nil {
				iface.IPAddresses = append(iface.IPAddresses, ip)
			}
		}

		// Gateway
		if len(cfg.DefaultIPGateway) > 0 {
			iface.Gateway = cfg.DefaultIPGateway[0]
		}

		// DNS
		iface.DNSServers = cfg.DNSServerSearchOrder

		// Status from adapter
		if adapter, ok := adapterMap[cfg.Index]; ok {
			iface.Name = adapter.Name
			iface.Status = connectionStatusToString(adapter.NetConnectionStatus)
			if adapter.Speed > 0 {
				iface.Speed = formatSpeed(adapter.Speed)
			}
		}

		info.Interfaces = append(info.Interfaces, iface)
	}

	// Check internet connectivity
	info.InternetReachable = checkInternetConnectivity()

	return info, nil
}

// MeasureServerLatency measures HTTP latency to the API server
func MeasureServerLatency(apiURL string) int {
	// Trim to base URL
	baseURL := strings.TrimSuffix(apiURL, "/api")
	baseURL = strings.TrimSuffix(baseURL, "/")

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "HEAD", baseURL+"/health", nil)
	if err != nil {
		return -1
	}

	resp, err := client.Do(req)
	if err != nil {
		return -1
	}
	defer resp.Body.Close()

	return int(time.Since(start).Milliseconds())
}

func checkInternetConnectivity() bool {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}
	// Use Microsoft's connectivity check URL (standard Windows behavior)
	resp, err := client.Get("http://www.msftconnecttest.com/connecttest.txt")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func connectionStatusToString(status uint16) string {
	switch status {
	case 0:
		return "Disconnected"
	case 1:
		return "Connecting"
	case 2:
		return "Connected"
	case 3:
		return "Disconnecting"
	case 4:
		return "Hardware not present"
	case 5:
		return "Hardware disabled"
	case 6:
		return "Hardware malfunction"
	case 7:
		return "Media disconnected"
	case 8:
		return "Authenticating"
	case 9:
		return "Authentication succeeded"
	case 10:
		return "Authentication failed"
	case 11:
		return "Invalid address"
	case 12:
		return "Credentials required"
	default:
		return "Unknown"
	}
}

func formatSpeed(bitsPerSecond uint64) string {
	gbps := float64(bitsPerSecond) / 1_000_000_000
	if gbps >= 1 {
		return fmt.Sprintf("%.0f Gbps", gbps)
	}
	mbps := float64(bitsPerSecond) / 1_000_000
	return fmt.Sprintf("%.0f Mbps", mbps)
}
