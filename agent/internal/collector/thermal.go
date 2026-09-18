package collector

import (
	"bytes"
	"context"
	"encoding/json"
	"os/exec"
	"sort"
	"strings"
	"time"
)

const (
	ThermalStatusNormal      = "NORMAL"
	ThermalStatusWarning     = "WARNING"
	ThermalStatusCritical    = "CRITICAL"
	ThermalStatusUnavailable = "UNAVAILABLE"

	thermalWarningC  = 80.0
	thermalCriticalC = 90.0
)

// ThermalSensor is one verified temperature source exposed by Windows,
// a hardware monitor provider, or a vendor utility.
type ThermalSensor struct {
	Name         string  `json:"name"`
	TemperatureC float64 `json:"temperatureC"`
	Status       string  `json:"status"`
	Source       string  `json:"source"`
}

// ThermalInfo contains optional CPU/GPU temperatures. Missing sensors are
// represented explicitly as unavailable; zero values are never invented.
type ThermalInfo struct {
	Available bool            `json:"available"`
	Status    string          `json:"status"`
	CPU       *ThermalSensor  `json:"cpu,omitempty"`
	GPUs      []ThermalSensor `json:"gpus,omitempty"`
}

type rawThermalSensor struct {
	Name  string  `json:"name"`
	TempC float64 `json:"tempC"`
	Source string `json:"source"`
}

type rawThermalResult struct {
	CPU  *rawThermalSensor  `json:"cpu"`
	GPUs []rawThermalSensor `json:"gpus"`
}

// CollectThermal performs best-effort temperature discovery.
//
// CPU:
//   - LibreHardwareMonitor WMI provider, when present.
//   - OpenHardwareMonitor WMI provider, when present.
//
// GPU:
//   - the same hardware-monitor WMI providers;
//   - NVIDIA nvidia-smi as a native vendor fallback.
//
// Windows does not expose a trustworthy generic CPU package-temperature API,
// so ACPI thermal zones are intentionally not reported as CPU temperature.
func CollectThermal() *ThermalInfo {
	result := &ThermalInfo{
		Available: false,
		Status:    ThermalStatusUnavailable,
		GPUs:      []ThermalSensor{},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	script := `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$cpuRows = @()
$gpuRows = @()

foreach ($ns in @('root\LibreHardwareMonitor', 'root\OpenHardwareMonitor')) {
    try {
        $hardwareNames = @{}
        try {
            Get-CimInstance -Namespace $ns -ClassName Hardware -ErrorAction Stop | ForEach-Object {
                $hardwareNames["$($_.Identifier)"] = "$($_.Name)"
            }
        } catch {}

        $sensors = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop |
            Where-Object { "$($_.SensorType)" -eq 'Temperature' }

        foreach ($s in @($sensors)) {
            $value = 0.0
            if (-not [double]::TryParse(
                "$($s.Value)",
                [System.Globalization.NumberStyles]::Float,
                [System.Globalization.CultureInfo]::InvariantCulture,
                [ref]$value
            )) { continue }

            if ($value -lt -20 -or $value -gt 150) { continue }

            $identifier = "$($s.Identifier)"
            $sensorName = "$($s.Name)"
            $parent = "$($s.Parent)"
            $deviceName = if ($hardwareNames.ContainsKey($parent)) { $hardwareNames[$parent] } else { $sensorName }
            $source = if ($ns -like '*LibreHardwareMonitor') { 'LibreHardwareMonitor' } else { 'OpenHardwareMonitor' }

            if (
                $identifier -match '(?i)(amdcpu|intelcpu|/cpu/)' -or
                $sensorName -match '(?i)(CPU Package|CPU Core|Tctl|Tdie)'
            ) {
                $cpuRows += [PSCustomObject]@{
                    name = if ($deviceName) { $deviceName } else { $sensorName }
                    sensor = $sensorName
                    tempC = [math]::Round($value, 1)
                    source = $source
                }
                continue
            }

            if (
                $identifier -match '(?i)(/gpu|gpu-nvidia|gpu-amd|gpu-intel)' -or
                $sensorName -match '(?i)GPU'
            ) {
                $gpuRows += [PSCustomObject]@{
                    name = if ($deviceName) { $deviceName } else { $sensorName }
                    sensor = $sensorName
                    tempC = [math]::Round($value, 1)
                    source = $source
                    parent = $parent
                }
            }
        }
    } catch {}
}

$cpu = $null
if ($cpuRows.Count -gt 0) {
    $preferred = @($cpuRows | Where-Object { $_.sensor -match '(?i)(Package|Tctl|Tdie)' } | Sort-Object tempC -Descending)
    if ($preferred.Count -gt 0) {
        $cpu = $preferred[0]
    } else {
        $cpu = @($cpuRows | Sort-Object tempC -Descending)[0]
    }
}

$gpus = @()
if ($gpuRows.Count -gt 0) {
    $groups = $gpuRows | Group-Object {
        if ($_.parent) { $_.parent } else { $_.name }
    }

    foreach ($group in $groups) {
        $preferred = @($group.Group | Where-Object {
            $_.sensor -match '(?i)(GPU Core|Core|Temperature)' -and
            $_.sensor -notmatch '(?i)(Hot Spot|Memory|VRM)'
        } | Sort-Object tempC -Descending)

        $chosen = if ($preferred.Count -gt 0) {
            $preferred[0]
        } else {
            @($group.Group | Sort-Object tempC -Descending)[0]
        }

        $gpus += [PSCustomObject]@{
            name = $chosen.name
            tempC = $chosen.tempC
            source = $chosen.source
        }
    }
}

# Native NVIDIA fallback when no GPU sensor provider is available.
if ($gpus.Count -eq 0) {
    try {
        $lines = @(& nvidia-smi --query-gpu=name,temperature.gpu --format=csv,noheader,nounits 2>$null)
        foreach ($line in $lines) {
            if (-not $line) { continue }
            $parts = $line -split ',', 2
            if ($parts.Count -ne 2) { continue }

            $temp = 0.0
            if (-not [double]::TryParse(
                $parts[1].Trim(),
                [System.Globalization.NumberStyles]::Float,
                [System.Globalization.CultureInfo]::InvariantCulture,
                [ref]$temp
            )) { continue }

            if ($temp -lt -20 -or $temp -gt 150) { continue }

            $gpus += [PSCustomObject]@{
                name = $parts[0].Trim()
                tempC = [math]::Round($temp, 1)
                source = 'nvidia-smi'
            }
        }
    } catch {}
}

$out = [PSCustomObject]@{
    cpu = if ($cpu) {
        [PSCustomObject]@{
            name = "$($cpu.name)"
            tempC = [double]$cpu.tempC
            source = "$($cpu.source)"
        }
    } else { $null }
    gpus = @($gpus)
}

$out | ConvertTo-Json -Depth 5 -Compress`

	cmd := exec.CommandContext(
		ctx,
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-Command", script,
	)

	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return result
	}

	var raw rawThermalResult
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout.String())), &raw); err != nil {
		return result
	}

	if raw.CPU != nil && validThermalValue(raw.CPU.TempC) {
		result.CPU = &ThermalSensor{
			Name:         cleanThermalName(raw.CPU.Name, "CPU"),
			TemperatureC: roundTo1(raw.CPU.TempC),
			Status:       temperatureStatus(raw.CPU.TempC),
			Source:       raw.CPU.Source,
		}
		result.Available = true
	}

	seenGPU := map[string]struct{}{}
	for _, gpu := range raw.GPUs {
		if !validThermalValue(gpu.TempC) {
			continue
		}
		name := cleanThermalName(gpu.Name, "GPU")
		key := strings.ToLower(name)
		if _, exists := seenGPU[key]; exists {
			continue
		}
		seenGPU[key] = struct{}{}

		result.GPUs = append(result.GPUs, ThermalSensor{
			Name:         name,
			TemperatureC: roundTo1(gpu.TempC),
			Status:       temperatureStatus(gpu.TempC),
			Source:       gpu.Source,
		})
		result.Available = true
	}

	sort.SliceStable(result.GPUs, func(i, j int) bool {
		return result.GPUs[i].Name < result.GPUs[j].Name
	})

	if !result.Available {
		return result
	}

	result.Status = ThermalStatusNormal
	if result.CPU != nil {
		result.Status = worstThermalStatus(result.Status, result.CPU.Status)
	}
	for _, gpu := range result.GPUs {
		result.Status = worstThermalStatus(result.Status, gpu.Status)
	}

	return result
}

func validThermalValue(tempC float64) bool {
	return tempC > -20 && tempC <= 150
}

func cleanThermalName(name, fallback string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return fallback
	}
	return name
}

func temperatureStatus(tempC float64) string {
	switch {
	case tempC >= thermalCriticalC:
		return ThermalStatusCritical
	case tempC >= thermalWarningC:
		return ThermalStatusWarning
	default:
		return ThermalStatusNormal
	}
}

func worstThermalStatus(a, b string) string {
	rank := map[string]int{
		ThermalStatusUnavailable: 0,
		ThermalStatusNormal:      1,
		ThermalStatusWarning:     2,
		ThermalStatusCritical:    3,
	}
	if rank[b] > rank[a] {
		return b
	}
	return a
}

func roundTo1(v float64) float64 {
	if v >= 0 {
		return float64(int(v*10+0.5)) / 10
	}
	return float64(int(v*10-0.5)) / 10
}
