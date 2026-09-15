package collector

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// IdentityInfo contains device identification data
type IdentityInfo struct {
	Hostname     string `json:"hostname"`
	FQDN         string `json:"fqdn,omitempty"`
	MachineGUID  string `json:"machineGuid,omitempty"`
	Manufacturer string `json:"manufacturer,omitempty"`
	Model        string `json:"model,omitempty"`
	SerialNumber string `json:"serialNumber,omitempty"`
	OSEdition    string `json:"osEdition,omitempty"`
	OSVersion    string `json:"osVersion,omitempty"`
	OSBuild      string `json:"osBuild,omitempty"`
	Architecture string `json:"architecture"`
	Timezone     string `json:"timezone"`
	ActiveUser   string `json:"activeUser,omitempty"`
}

// Win32_ComputerSystemProduct is the WMI class for system identification
type Win32_ComputerSystemProduct struct {
	UUID string
}

// Win32_ComputerSystem is the WMI class for computer information
type Win32_ComputerSystem struct {
	Manufacturer string
	Model        string
	DNSHostName  string
	Domain       string
}

// Win32_BIOS is the WMI class for BIOS information
type Win32_BIOS struct {
	SerialNumber string
}

// Win32_OperatingSystem is the WMI class for OS information
type Win32_OperatingSystem struct {
	Caption      string
	Version      string
	BuildNumber  string
	OSArchitecture string
}

// CollectIdentity gathers device identification information
func CollectIdentity() (*IdentityInfo, error) {
	info := &IdentityInfo{
		Architecture: runtime.GOARCH,
	}

	// Hostname
	hostname, err := os.Hostname()
	if err != nil {
		return nil, fmt.Errorf("getting hostname: %w", err)
	}
	info.Hostname = hostname

	// Timezone
	zone, _ := time.Now().Zone()
	info.Timezone = zone

	// WMI: Computer System (manufacturer, model)
	var cs []Win32_ComputerSystem
	if err := wmi.Query("SELECT Manufacturer, Model, DNSHostName, Domain FROM Win32_ComputerSystem", &cs); err == nil && len(cs) > 0 {
		info.Manufacturer = strings.TrimSpace(cs[0].Manufacturer)
		info.Model = strings.TrimSpace(cs[0].Model)
		if cs[0].Domain != "" {
			info.FQDN = cs[0].DNSHostName + "." + cs[0].Domain
		}
	}

	// WMI: BIOS (serial number)
	var bios []Win32_BIOS
	if err := wmi.Query("SELECT SerialNumber FROM Win32_BIOS", &bios); err == nil && len(bios) > 0 {
		sn := strings.TrimSpace(bios[0].SerialNumber)
		// Filter out placeholder serials
		if sn != "" && sn != "To be filled by O.E.M." && sn != "Default string" && sn != "System Serial Number" {
			info.SerialNumber = sn
		}
	}

	// WMI: Computer System Product (UUID)
	var csp []Win32_ComputerSystemProduct
	if err := wmi.Query("SELECT UUID FROM Win32_ComputerSystemProduct", &csp); err == nil && len(csp) > 0 {
		uuid := strings.TrimSpace(csp[0].UUID)
		if uuid != "" && uuid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" {
			info.MachineGUID = uuid
		}
	}

	// WMI: Operating System
	var osInfo []Win32_OperatingSystem
	if err := wmi.Query("SELECT Caption, Version, BuildNumber, OSArchitecture FROM Win32_OperatingSystem", &osInfo); err == nil && len(osInfo) > 0 {
		info.OSEdition = strings.TrimSpace(osInfo[0].Caption)
		info.OSVersion = strings.TrimSpace(osInfo[0].Version)
		info.OSBuild = strings.TrimSpace(osInfo[0].BuildNumber)
		if osInfo[0].OSArchitecture != "" {
			info.Architecture = strings.TrimSpace(osInfo[0].OSArchitecture)
		}
	}

	return info, nil
}
