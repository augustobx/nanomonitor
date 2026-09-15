package collector

import (
	"fmt"
	"strings"

	"github.com/yusufpapurcu/wmi"
)

// HardwareInfo contains static hardware information
type HardwareInfo struct {
	CPU       CPUInfo    `json:"cpu"`
	RAM       RAMInfo    `json:"ram"`
	Disks     []DiskInfo `json:"disks"`
}

// CPUInfo contains CPU details
type CPUInfo struct {
	Name         string `json:"name"`
	Manufacturer string `json:"manufacturer,omitempty"`
	Cores        int    `json:"cores"`
	LogicalCores int    `json:"logicalCores"`
	MaxClockMHz  int    `json:"maxClockMhz,omitempty"`
}

// RAMInfo contains memory details
type RAMInfo struct {
	TotalMB int `json:"totalMb"`
	Slots   int `json:"slots,omitempty"`
}

// DiskInfo contains physical disk details
type DiskInfo struct {
	Model     string `json:"model"`
	SizeGB    int    `json:"sizeGb"`
	MediaType string `json:"mediaType,omitempty"` // SSD, HDD, NVMe
	Interface string `json:"interface,omitempty"` // SATA, NVMe, USB
	Serial    string `json:"serial,omitempty"`
}

// WMI query structs

type Win32_Processor struct {
	Name                 string
	Manufacturer         string
	NumberOfCores        uint32
	NumberOfLogicalProcessors uint32
	MaxClockSpeed        uint32
}

type Win32_PhysicalMemory struct {
	Capacity uint64
}

type Win32_DiskDrive struct {
	Model        string
	Size         uint64
	MediaType    string
	InterfaceType string
	SerialNumber string
}

// CollectHardware gathers static hardware information
func CollectHardware() (*HardwareInfo, error) {
	info := &HardwareInfo{}

	// CPU
	var processors []Win32_Processor
	if err := wmi.Query("SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor", &processors); err != nil {
		return nil, fmt.Errorf("querying CPU info: %w", err)
	}
	if len(processors) > 0 {
		p := processors[0]
		info.CPU = CPUInfo{
			Name:         strings.TrimSpace(p.Name),
			Manufacturer: strings.TrimSpace(p.Manufacturer),
			Cores:        int(p.NumberOfCores),
			LogicalCores: int(p.NumberOfLogicalProcessors),
			MaxClockMHz:  int(p.MaxClockSpeed),
		}
	}

	// RAM
	var memory []Win32_PhysicalMemory
	if err := wmi.Query("SELECT Capacity FROM Win32_PhysicalMemory", &memory); err != nil {
		return nil, fmt.Errorf("querying RAM info: %w", err)
	}
	var totalBytes uint64
	for _, m := range memory {
		totalBytes += m.Capacity
	}
	info.RAM = RAMInfo{
		TotalMB: int(totalBytes / 1024 / 1024),
		Slots:   len(memory),
	}

	// Disks
	var disks []Win32_DiskDrive
	if err := wmi.Query("SELECT Model, Size, MediaType, InterfaceType, SerialNumber FROM Win32_DiskDrive", &disks); err != nil {
		return nil, fmt.Errorf("querying disk info: %w", err)
	}
	for _, d := range disks {
		mediaType := classifyMediaType(d.MediaType, d.Model)
		info.Disks = append(info.Disks, DiskInfo{
			Model:     strings.TrimSpace(d.Model),
			SizeGB:    int(d.Size / 1024 / 1024 / 1024),
			MediaType: mediaType,
			Interface: strings.TrimSpace(d.InterfaceType),
			Serial:    strings.TrimSpace(d.SerialNumber),
		})
	}

	return info, nil
}

// classifyMediaType attempts to determine if a disk is SSD, HDD, or NVMe
func classifyMediaType(wmiMediaType, model string) string {
	lower := strings.ToLower(wmiMediaType + " " + model)

	if strings.Contains(lower, "nvme") {
		return "NVMe"
	}
	if strings.Contains(lower, "ssd") || strings.Contains(lower, "solid state") {
		return "SSD"
	}
	if strings.Contains(lower, "hdd") || strings.Contains(lower, "fixed hard disk") {
		return "HDD"
	}
	// WMI MediaType for fixed hard disks
	if wmiMediaType == "Fixed hard disk media" {
		// Could be SSD or HDD, but WMI doesn't reliably distinguish
		// Will be refined with SMART data in F4
		return "Unknown"
	}
	if strings.Contains(lower, "removable") || strings.Contains(lower, "usb") {
		return "Removable"
	}
	return "Unknown"
}
