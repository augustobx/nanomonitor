package collector

import (
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// SmartDiskReport represents the SMART / physical health status of a single disk
type SmartDiskReport struct {
	DeviceID          string `json:"deviceId"`
	FriendlyName      string `json:"friendlyName"`
	Model             string `json:"model"`
	MediaType         string `json:"mediaType"`
	HealthStatus      string `json:"healthStatus"`      // "OK", "WARNING", "CRITICAL", "UNKNOWN"
	OperationalStatus string `json:"operationalStatus"` // "OK", "Degraded", "Failed", etc.
	PredictFailure    bool   `json:"predictFailure"`
	TemperatureC      *int   `json:"temperatureC,omitempty"`
	WearPercent       *int   `json:"wearPercent,omitempty"`
}

// SmartReport summarizes physical disk health across all system storage drives
type SmartReport struct {
	Timestamp      time.Time         `json:"timestamp"`
	OverallStatus  string            `json:"overallStatus"` // "OK", "WARNING", "CRITICAL"
	DegradedCount  int               `json:"degradedCount"`
	Disks          []SmartDiskReport `json:"disks"`
	StatusDegraded bool              `json:"statusDegraded"` // true if transition from healthy to degraded
}

type storageReliabilityCounter struct {
	DeviceID    string
	Temperature uint32
	Wear        uint32
}

// CollectSmart inspects physical drives via MSFT_PhysicalDisk and storage counters
func CollectSmart() (*SmartReport, error) {
	storage, err := CollectStorage()
	if err != nil {
		return nil, err
	}

	report := &SmartReport{
		Timestamp:     time.Now().UTC(),
		OverallStatus: "OK",
		Disks:         make([]SmartDiskReport, 0, len(storage.Disks)),
	}

	// Try querying MSFT_StorageReliabilityCounter for temperature/wear (elevated LocalSystem)
	var counters []storageReliabilityCounter
	counterMap := make(map[string]storageReliabilityCounter)
	counterQuery := "SELECT DeviceId, Temperature, Wear FROM MSFT_StorageReliabilityCounter"
	if err := wmi.QueryNamespace(counterQuery, &counters, `root\Microsoft\Windows\Storage`); err == nil {
		for _, c := range counters {
			counterMap[c.DeviceID] = c
		}
	}

	hasWarning := false
	hasCritical := false

	for _, d := range storage.Disks {
		health := "OK"
		isCrit := d.PredictFailure ||
			strings.EqualFold(d.HealthStatus, "Unhealthy") ||
			strings.EqualFold(d.OperationalStatus, "Failed") ||
			strings.EqualFold(d.OperationalStatus, "Error")

		isWarn := strings.EqualFold(d.HealthStatus, "Warning") ||
			strings.EqualFold(d.OperationalStatus, "Degraded") ||
			strings.EqualFold(d.OperationalStatus, "Stressed")

		if isCrit {
			health = "CRITICAL"
			hasCritical = true
			report.DegradedCount++
		} else if isWarn {
			health = "WARNING"
			hasWarning = true
			report.DegradedCount++
		}

		diskRep := SmartDiskReport{
			DeviceID:          d.DeviceID,
			FriendlyName:      d.FriendlyName,
			Model:             d.Model,
			MediaType:         d.MediaType,
			HealthStatus:      health,
			OperationalStatus: d.OperationalStatus,
			PredictFailure:    d.PredictFailure,
		}

		if c, found := counterMap[d.DeviceID]; found {
			if c.Temperature > 0 && c.Temperature < 150 {
				t := int(c.Temperature)
				diskRep.TemperatureC = &t
			}
			if c.Wear <= 100 {
				w := int(c.Wear)
				diskRep.WearPercent = &w
			}
		}

		report.Disks = append(report.Disks, diskRep)
	}

	if hasCritical {
		report.OverallStatus = "CRITICAL"
	} else if hasWarning {
		report.OverallStatus = "WARNING"
	}

	return report, nil
}
