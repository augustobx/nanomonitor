package collector

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
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
	Sensor       string  `json:"sensor,omitempty"`
	TemperatureC float64 `json:"temperatureC"`
	Status       string  `json:"status"`
	Source       string  `json:"source"`
}

// ThermalInfo contains optional CPU/GPU temperatures. Missing sensors are
// represented explicitly as unavailable; zero values are never invented.
type ThermalInfo struct {
	Available      bool            `json:"available"`
	Status         string          `json:"status"`
	CPU            *ThermalSensor  `json:"cpu,omitempty"`
	GPUs           []ThermalSensor `json:"gpus,omitempty"`
	Motherboard    []ThermalSensor `json:"motherboard,omitempty"`
	Provider       string          `json:"provider,omitempty"`
	ProviderStatus string          `json:"providerStatus,omitempty"`
	Message        string          `json:"message,omitempty"`
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

type bundledThermalSensor struct {
	Kind         string  `json:"kind"`
	HardwareName string  `json:"hardwareName"`
	SensorName   string  `json:"sensorName"`
	Identifier   string  `json:"identifier"`
	TempC        float64 `json:"tempC"`
	Source       string  `json:"source"`
}

type bundledThermalResult struct {
	Available bool                   `json:"available"`
	Provider  string                 `json:"provider"`
	Status    string                 `json:"status"`
	Message   string                 `json:"message"`
	Sensors   []bundledThermalSensor `json:"sensors"`
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
		Available:   false,
		Status:      ThermalStatusUnavailable,
		GPUs:        []ThermalSensor{},
		Motherboard: []ThermalSensor{},
	}

	// Primary source: NanoThermal, bundled with the agent. It links
	// LibreHardwareMonitor directly so endpoints do not need to run a separate
	// desktop monitoring application or expose a WMI namespace.
	bundled := collectBundledThermal()
	if bundled != nil {
		result.Provider = cleanThermalName(bundled.Provider, "NanoThermal / LibreHardwareMonitor")
		result.ProviderStatus = cleanThermalName(bundled.Status, "UNKNOWN")
		result.Message = strings.TrimSpace(bundled.Message)
		applyBundledThermal(result, bundled)
		if result.Available {
			return finalizeThermalInfo(result)
		}
		if result.ProviderStatus == "NO_SUPPORTED_SENSORS" && !pawnIODriverInstalled() {
			result.ProviderStatus = "PROVIDER_NOT_INSTALLED"
			result.Message = "El proveedor de bajo nivel PawnIO no está instalado o no está registrado en Windows."
		}
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

            if ($value -le 0 -or $value -gt 150) { continue }

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

            if ($temp -le 0 -or $temp -gt 150) { continue }

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
		if result.Provider == "" {
			result.Provider = "Windows / Vendor fallback"
		}
		if result.ProviderStatus == "" {
			result.ProviderStatus = "NO_SUPPORTED_SENSORS"
		}
		if result.Message == "" {
			result.Message = "El hardware no expone sensores térmicos compatibles con los proveedores disponibles."
		}
		return result
	}

	// If NanoThermal did not produce data but a legacy/provider fallback did,
	// make that explicit instead of claiming the low-level provider succeeded.
	result.Provider = "Windows / Vendor fallback"
	result.ProviderStatus = "FALLBACK"
	if result.Message == "" {
		result.Message = "Lectura obtenida mediante proveedor WMI existente o utilidad nativa del fabricante."
	}
	return finalizeThermalInfo(result)
}


func collectBundledThermal() *bundledThermalResult {
	exePath, err := os.Executable()
	if err != nil {
		return &bundledThermalResult{
			Provider: "NanoThermal / LibreHardwareMonitor",
			Status:   "HELPER_ERROR",
			Message:  "No se pudo resolver la ruta del agente para localizar NanoThermal.",
			Sensors:  []bundledThermalSensor{},
		}
	}

	helperPath := filepath.Join(filepath.Dir(exePath), "nanothermal.exe")
	if _, err := os.Stat(helperPath); err != nil {
		return &bundledThermalResult{
			Provider: "NanoThermal / LibreHardwareMonitor",
			Status:   "HELPER_MISSING",
			Message:  "El componente nanothermal.exe no está instalado junto al agente.",
			Sensors:  []bundledThermalSensor{},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, helperPath)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = "NanoThermal no pudo completar la lectura de sensores."
		}
		return &bundledThermalResult{
			Provider: "NanoThermal / LibreHardwareMonitor",
			Status:   "HELPER_ERROR",
			Message:  message,
			Sensors:  []bundledThermalSensor{},
		}
	}

	var raw bundledThermalResult
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout.String())), &raw); err != nil {
		return &bundledThermalResult{
			Provider: "NanoThermal / LibreHardwareMonitor",
			Status:   "HELPER_ERROR",
			Message:  "NanoThermal devolvió una respuesta que el agente no pudo interpretar.",
			Sensors:  []bundledThermalSensor{},
		}
	}

	if raw.Provider == "" {
		raw.Provider = "NanoThermal / LibreHardwareMonitor"
	}
	if raw.Status == "" {
		if raw.Available {
			raw.Status = "READY"
		} else {
			raw.Status = "NO_SUPPORTED_SENSORS"
		}
	}
	if raw.Sensors == nil {
		raw.Sensors = []bundledThermalSensor{}
	}
	return &raw
}

func applyBundledThermal(result *ThermalInfo, raw *bundledThermalResult) {
	if result == nil || raw == nil {
		return
	}

	var cpuRows []bundledThermalSensor
	gpuRows := map[string][]bundledThermalSensor{}
	var boardRows []bundledThermalSensor

	for _, sensor := range raw.Sensors {
		if !validThermalValue(sensor.TempC) {
			continue
		}

		switch strings.ToUpper(strings.TrimSpace(sensor.Kind)) {
		case "CPU":
			cpuRows = append(cpuRows, sensor)
		case "GPU":
			key := strings.ToLower(strings.TrimSpace(sensor.HardwareName))
			if key == "" {
				key = strings.ToLower(strings.TrimSpace(sensor.Identifier))
			}
			if key == "" {
				key = "gpu"
			}
			gpuRows[key] = append(gpuRows[key], sensor)
		case "MOTHERBOARD":
			boardRows = append(boardRows, sensor)
		}
	}

	if chosen, ok := chooseBundledSensor(cpuRows, "CPU"); ok {
		result.CPU = bundledSensorToThermal(chosen, "CPU")
		result.Available = true
	}

	gpuKeys := make([]string, 0, len(gpuRows))
	for key := range gpuRows {
		gpuKeys = append(gpuKeys, key)
	}
	sort.Strings(gpuKeys)
	for _, key := range gpuKeys {
		if chosen, ok := chooseBundledSensor(gpuRows[key], "GPU"); ok {
			result.GPUs = append(result.GPUs, *bundledSensorToThermal(chosen, "GPU"))
			result.Available = true
		}
	}

	sort.SliceStable(boardRows, func(i, j int) bool {
		si := bundledSensorPreference(boardRows[i], "MOTHERBOARD")
		sj := bundledSensorPreference(boardRows[j], "MOTHERBOARD")
		if si != sj {
			return si > sj
		}
		if boardRows[i].HardwareName != boardRows[j].HardwareName {
			return boardRows[i].HardwareName < boardRows[j].HardwareName
		}
		return boardRows[i].SensorName < boardRows[j].SensorName
	})

	seenBoard := map[string]struct{}{}
	for _, row := range boardRows {
		if len(result.Motherboard) >= 4 {
			break
		}
		key := strings.ToLower(strings.TrimSpace(row.HardwareName + "|" + row.SensorName))
		if _, exists := seenBoard[key]; exists {
			continue
		}
		seenBoard[key] = struct{}{}
		result.Motherboard = append(result.Motherboard, *bundledSensorToThermal(row, "Motherboard"))
		result.Available = true
	}
}

func chooseBundledSensor(rows []bundledThermalSensor, kind string) (bundledThermalSensor, bool) {
	if len(rows) == 0 {
		return bundledThermalSensor{}, false
	}
	sort.SliceStable(rows, func(i, j int) bool {
		si := bundledSensorPreference(rows[i], kind)
		sj := bundledSensorPreference(rows[j], kind)
		if si != sj {
			return si > sj
		}
		return rows[i].TempC > rows[j].TempC
	})
	return rows[0], true
}

func bundledSensorPreference(row bundledThermalSensor, kind string) int {
	name := strings.ToLower(row.SensorName)
	switch strings.ToUpper(kind) {
	case "CPU":
		switch {
		case strings.Contains(name, "package"):
			return 100
		case strings.Contains(name, "tctl") || strings.Contains(name, "tdie"):
			return 95
		case strings.Contains(name, "core average") || strings.Contains(name, "cpu die"):
			return 90
		case strings.Contains(name, "core"):
			return 70
		default:
			return 40
		}
	case "GPU":
		switch {
		case strings.Contains(name, "hot spot") || strings.Contains(name, "hotspot") || strings.Contains(name, "memory"):
			return 10
		case strings.Contains(name, "core"):
			return 100
		case strings.Contains(name, "gpu") && strings.Contains(name, "temperature"):
			return 95
		default:
			return 50
		}
	case "MOTHERBOARD":
		switch {
		case strings.Contains(name, "system") || strings.Contains(name, "motherboard"):
			return 100
		case strings.Contains(name, "chipset") || strings.Contains(name, "pch"):
			return 90
		case strings.Contains(name, "vrm"):
			return 80
		case strings.Contains(name, "cpu"):
			return 70
		default:
			return 40
		}
	default:
		return 0
	}
}

func bundledSensorToThermal(row bundledThermalSensor, fallback string) *ThermalSensor {
	source := cleanThermalName(row.Source, "NanoThermal / LibreHardwareMonitor")
	return &ThermalSensor{
		Name:         cleanThermalName(row.HardwareName, fallback),
		Sensor:       strings.TrimSpace(row.SensorName),
		TemperatureC: roundTo1(row.TempC),
		Status:       temperatureStatus(row.TempC),
		Source:       source,
	}
}

func pawnIODriverInstalled() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, "sc.exe", "query", "PawnIO").Run() == nil
}

func finalizeThermalInfo(result *ThermalInfo) *ThermalInfo {
	if result == nil || !result.Available {
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
	return tempC > 0 && tempC <= 150
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
