package collector

import (
	"strings"

	"github.com/yusufpapurcu/wmi"
)

// PhysicalDiskInfo holds detailed health and hardware data for physical drives
type PhysicalDiskInfo struct {
	DeviceID          string `json:"deviceId"`
	FriendlyName      string `json:"friendlyName"`
	Model             string `json:"model"`
	MediaType         string `json:"mediaType"` // NVMe, SSD, HDD, Unknown
	BusType           string `json:"busType"`   // NVMe, SATA, SAS, USB, SCSI
	SizeGB            int    `json:"sizeGb"`
	HealthStatus      string `json:"healthStatus"`      // Healthy, Warning, Unhealthy
	OperationalStatus string `json:"operationalStatus"` // OK, Degraded, Failed
	PredictFailure    bool   `json:"predictFailure"`
}

// StorageInventory holds the physical storage subsystem report
type StorageInventory struct {
	Disks []PhysicalDiskInfo `json:"disks"`
}

type msftPhysicalDisk struct {
	FriendlyName string
	MediaType    uint16
	BusType      uint16
	HealthStatus uint16
	Size         uint64
}

type win32DiskDriveItem struct {
	DeviceID      string
	Model         string
	Size          uint64
	Status        string
	InterfaceType string
	MediaType     string
}

// CollectStorage collects physical disk health, media types (NVMe/SSD/HDD) and SMART status
func CollectStorage() (*StorageInventory, error) {
	storage := &StorageInventory{
		Disks: make([]PhysicalDiskInfo, 0),
	}

	// 1. First attempt: Query root\Microsoft\Windows\Storage (MSFT_PhysicalDisk)
	var msftDisks []msftPhysicalDisk
	msftQuery := "SELECT FriendlyName, MediaType, BusType, HealthStatus, Size FROM MSFT_PhysicalDisk"
	err := wmi.QueryNamespace(msftQuery, &msftDisks, `root\Microsoft\Windows\Storage`)

	if err == nil && len(msftDisks) > 0 {
		for i, d := range msftDisks {
			sizeGB := int(d.Size / (1024 * 1024 * 1024))
			busTypeName := decodeBusType(d.BusType)
			mediaTypeName := decodeMediaType(d.MediaType, busTypeName)
			healthName := decodeHealthStatus(d.HealthStatus)

			storage.Disks = append(storage.Disks, PhysicalDiskInfo{
				DeviceID:          strings.TrimSpace(d.FriendlyName),
				FriendlyName:      strings.TrimSpace(d.FriendlyName),
				Model:             strings.TrimSpace(d.FriendlyName),
				MediaType:         mediaTypeName,
				BusType:           busTypeName,
				SizeGB:            sizeGB,
				HealthStatus:      healthName,
				OperationalStatus: "OK",
				PredictFailure:    d.HealthStatus != 0,
			})
			_ = i
		}
		return storage, nil
	}

	// 2. Fallback: Query Win32_DiskDrive from root\cimv2
	var winDisks []win32DiskDriveItem
	winQuery := "SELECT DeviceID, Model, Size, Status, InterfaceType, MediaType FROM Win32_DiskDrive"
	if err := wmi.Query(winQuery, &winDisks); err == nil {
		for _, d := range winDisks {
			sizeGB := int(d.Size / (1024 * 1024 * 1024))
			mediaType := classifyMediaType(d.MediaType, d.Model)

			healthStatus := "Healthy"
			if strings.ToUpper(d.Status) != "OK" {
				healthStatus = "Warning"
			}

			storage.Disks = append(storage.Disks, PhysicalDiskInfo{
				DeviceID:          d.DeviceID,
				FriendlyName:      d.Model,
				Model:             d.Model,
				MediaType:         mediaType,
				BusType:           d.InterfaceType,
				SizeGB:            sizeGB,
				HealthStatus:      healthStatus,
				OperationalStatus: d.Status,
				PredictFailure:    strings.ToUpper(d.Status) != "OK",
			})
		}
	}

	return storage, nil
}

func decodeBusType(busType uint16) string {
	switch busType {
	case 17:
		return "NVMe"
	case 11:
		return "SATA"
	case 8:
		return "SAS"
	case 7:
		return "USB"
	case 3:
		return "ATAPI"
	case 1:
		return "SCSI"
	default:
		return "Unknown"
	}
}

func decodeMediaType(mediaType uint16, busType string) string {
	if busType == "NVMe" {
		return "NVMe"
	}
	switch mediaType {
	case 3:
		return "HDD"
	case 4:
		return "SSD"
	case 5:
		return "SCM"
	default:
		return "Unknown"
	}
}

func decodeHealthStatus(health uint16) string {
	switch health {
	case 0:
		return "Healthy"
	case 1:
		return "Warning"
	case 2:
		return "Unhealthy"
	default:
		return "Unknown"
	}
}
