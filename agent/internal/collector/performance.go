package collector

import (
	"fmt"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// PerformanceInfo contains real-time performance metrics
type PerformanceInfo struct {
	Timestamp   time.Time    `json:"timestamp"`
	CPUPercent  float64      `json:"cpuPercent"`
	RAMUsedMB   int          `json:"ramUsedMb"`
	RAMAvailMB  int          `json:"ramAvailMb"`
	RAMPercent  float64      `json:"ramPercent"`
	Volumes     []VolumeInfo `json:"volumes"`
	UptimeSecs  int64        `json:"uptimeSeconds"`
}

// VolumeInfo contains per-volume storage metrics
type VolumeInfo struct {
	Letter  string  `json:"letter"`
	Label   string  `json:"label,omitempty"`
	FSType  string  `json:"fsType,omitempty"`
	TotalGB float64 `json:"totalGb"`
	UsedGB  float64 `json:"usedGb"`
	FreeGB  float64 `json:"freeGb"`
	Percent float64 `json:"percent"`
}

// MEMORYSTATUSEX is the Windows API structure for memory info
type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64       = kernel32.NewProc("GetTickCount64")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
)

// prevIdleTime and prevKernelTime/prevUserTime for CPU calculation
var (
	prevIdleTime   uint64
	prevKernelTime uint64
	prevUserTime   uint64
	cpuInitialized bool
)

// CollectPerformance gathers real-time performance metrics
func CollectPerformance() (*PerformanceInfo, error) {
	info := &PerformanceInfo{
		Timestamp: time.Now().UTC(),
	}

	// CPU usage
	cpuPercent, err := getCPUUsage()
	if err != nil {
		// Non-fatal: log but continue
		cpuPercent = -1
	}
	info.CPUPercent = cpuPercent

	// Memory
	memStatus, err := getMemoryStatus()
	if err != nil {
		return nil, fmt.Errorf("getting memory status: %w", err)
	}
	totalMB := int(memStatus.TotalPhys / 1024 / 1024)
	availMB := int(memStatus.AvailPhys / 1024 / 1024)
	info.RAMUsedMB = totalMB - availMB
	info.RAMAvailMB = availMB
	if totalMB > 0 {
		info.RAMPercent = float64(info.RAMUsedMB) / float64(totalMB) * 100
	}

	// Volumes
	volumes, err := getVolumeInfo()
	if err != nil {
		// Non-fatal
		volumes = nil
	}
	info.Volumes = volumes

	// Uptime
	info.UptimeSecs = getUptimeSeconds()

	return info, nil
}

// getSystemTimes calls the Windows GetSystemTimes API via kernel32.dll
func getSystemTimes() (idle, kernel, user syscall.Filetime, err error) {
	r1, _, e1 := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if r1 == 0 {
		err = e1
	}
	return
}

// getCPUUsage calculates CPU usage between two sampling points
func getCPUUsage() (float64, error) {
	idleTime, kernelTime, userTime, err := getSystemTimes()
	if err != nil {
		return 0, fmt.Errorf("GetSystemTimes: %w", err)
	}

	idle := sysFiletimeToUint64(idleTime)
	kernel := sysFiletimeToUint64(kernelTime)
	user := sysFiletimeToUint64(userTime)

	if !cpuInitialized {
		prevIdleTime = idle
		prevKernelTime = kernel
		prevUserTime = user
		cpuInitialized = true
		// First call: wait briefly and sample again
		time.Sleep(500 * time.Millisecond)
		return getCPUUsage()
	}

	idleDelta := idle - prevIdleTime
	kernelDelta := kernel - prevKernelTime
	userDelta := user - prevUserTime

	prevIdleTime = idle
	prevKernelTime = kernel
	prevUserTime = user

	totalDelta := kernelDelta + userDelta
	if totalDelta == 0 {
		return 0, nil
	}

	// Kernel time includes idle time
	cpuPercent := (1.0 - float64(idleDelta)/float64(totalDelta)) * 100
	if cpuPercent < 0 {
		cpuPercent = 0
	}
	if cpuPercent > 100 {
		cpuPercent = 100
	}

	return cpuPercent, nil
}

func sysFiletimeToUint64(ft syscall.Filetime) uint64 {
	return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
}

func getMemoryStatus() (*memoryStatusEx, error) {
	var mem memoryStatusEx
	mem.Length = uint32(unsafe.Sizeof(mem))
	ret, _, err := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&mem)))
	if ret == 0 {
		return nil, fmt.Errorf("GlobalMemoryStatusEx failed: %w", err)
	}
	return &mem, nil
}

func getVolumeInfo() ([]VolumeInfo, error) {
	var volumes []VolumeInfo

	// Iterate drive letters A-Z
	for letter := 'A'; letter <= 'Z'; letter++ {
		root := string(letter) + `:\`
		rootPtr, err := windows.UTF16PtrFromString(root)
		if err != nil {
			continue
		}

		driveType := windows.GetDriveType(rootPtr)
		// Only include fixed and removable drives
		if driveType != windows.DRIVE_FIXED && driveType != windows.DRIVE_REMOVABLE {
			continue
		}

		var freeBytesAvailable, totalBytes, totalFreeBytes uint64
		err = windows.GetDiskFreeSpaceEx(rootPtr, &freeBytesAvailable, &totalBytes, &totalFreeBytes)
		if err != nil {
			continue // Drive might not be ready
		}

		totalGB := float64(totalBytes) / (1024 * 1024 * 1024)
		freeGB := float64(totalFreeBytes) / (1024 * 1024 * 1024)
		usedGB := totalGB - freeGB
		var percent float64
		if totalGB > 0 {
			percent = usedGB / totalGB * 100
		}

		// Get volume label and filesystem type
		var volumeNameBuf [256]uint16
		var fsNameBuf [256]uint16
		var serialNumber, maxComponentLen, fsFlags uint32

		_ = windows.GetVolumeInformation(
			rootPtr,
			&volumeNameBuf[0], uint32(len(volumeNameBuf)),
			&serialNumber, &maxComponentLen, &fsFlags,
			&fsNameBuf[0], uint32(len(fsNameBuf)),
		)

		volumes = append(volumes, VolumeInfo{
			Letter:  string(letter),
			Label:   windows.UTF16ToString(volumeNameBuf[:]),
			FSType:  windows.UTF16ToString(fsNameBuf[:]),
			TotalGB: roundTo2(totalGB),
			UsedGB:  roundTo2(usedGB),
			FreeGB:  roundTo2(freeGB),
			Percent: roundTo2(percent),
		})
	}

	return volumes, nil
}

func getUptimeSeconds() int64 {
	ret, _, _ := procGetTickCount64.Call()
	return int64(ret) / 1000
}

func roundTo2(f float64) float64 {
	return float64(int(f*100)) / 100
}
