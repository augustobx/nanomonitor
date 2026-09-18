package collector

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows/registry"
)

// HotfixInfo represents a Windows update / KB patch
type HotfixInfo struct {
	HotFixID    string `json:"hotfixId"`
	Description string `json:"description"`
	InstalledOn string `json:"installedOn"`
}

// WindowsUpdateInfo contains update status, hotfixes and reboot indicators
type WindowsUpdateInfo struct {
	RebootPending   bool         `json:"rebootPending"`
	RebootReason    string       `json:"rebootReason,omitempty"`
	LastInstallDate string       `json:"lastInstallDate,omitempty"`
	HotfixCount     int          `json:"hotfixCount"`
	RecentHotfixes  []HotfixInfo `json:"recentHotfixes"`
}

type win32QuickFixEngineering struct {
	HotFixID    string
	Description string
	InstalledOn string
}

// CollectWindowsUpdate collects patch status and checks for pending reboot
func CollectWindowsUpdate() (*WindowsUpdateInfo, error) {
	info := &WindowsUpdateInfo{
		RecentHotfixes: make([]HotfixInfo, 0),
	}

	// 1. Check for pending reboot indicators in Windows Registry
	rebootPending, reason := checkPendingReboot()
	info.RebootPending = rebootPending
	info.RebootReason = reason

	// 2. Query installed hotfixes via WMI
	var qfeList []win32QuickFixEngineering
	query := "SELECT HotFixID, Description, InstalledOn FROM Win32_QuickFixEngineering"
	if err := wmi.Query(query, &qfeList); err == nil && len(qfeList) > 0 {
		info.HotfixCount = len(qfeList)

		// Convert and sanitize hotfixes
		hotfixes := make([]HotfixInfo, 0, len(qfeList))
		for _, q := range qfeList {
			if strings.TrimSpace(q.HotFixID) == "" {
				continue
			}
			hotfixes = append(hotfixes, HotfixInfo{
				HotFixID:    strings.TrimSpace(q.HotFixID),
				Description: strings.TrimSpace(q.Description),
				InstalledOn: strings.TrimSpace(q.InstalledOn),
			})
		}

		// Sort by actual date, not by localized date text.
		sort.SliceStable(hotfixes, func(i, j int) bool {
			di, iOK := parseWindowsInstalledOn(hotfixes[i].InstalledOn)
			dj, jOK := parseWindowsInstalledOn(hotfixes[j].InstalledOn)
			if iOK && jOK {
				return di.After(dj)
			}
			if iOK != jOK {
				return iOK
			}
			return hotfixes[i].InstalledOn > hotfixes[j].InstalledOn
		})

		if len(hotfixes) > 0 {
			info.LastInstallDate = hotfixes[0].InstalledOn
		}

		// Store up to 10 most recent hotfixes
		if len(hotfixes) > 10 {
			info.RecentHotfixes = hotfixes[:10]
		} else {
			info.RecentHotfixes = hotfixes
		}
	}

	return info, nil
}

func parseWindowsInstalledOn(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}

	layouts := []string{
		"1/2/2006",
		"01/02/2006",
		"2/1/2006",
		"02/01/2006",
		"2006-01-02",
		"20060102",
		time.RFC3339,
	}

	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}

	return time.Time{}, false
}

// checkPendingReboot checks standard Windows registry flags for pending reboots
func checkPendingReboot() (bool, string) {
	// Check 1: Windows Update RebootRequired key
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`, registry.QUERY_VALUE)
	if err == nil {
		key.Close()
		return true, "Windows Update Reboot Required"
	}

	// Check 2: Component Based Servicing (CBS) RebootPending
	key, err = registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending`, registry.QUERY_VALUE)
	if err == nil {
		key.Close()
		return true, "Component Based Servicing (CBS) Reboot Pending"
	}

	// Check 3: PendingFileRenameOperations
	key, err = registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Session Manager`, registry.QUERY_VALUE)
	if err == nil {
		defer key.Close()
		val, _, err := key.GetStringsValue("PendingFileRenameOperations")
		if err == nil && len(val) > 0 {
			for _, v := range val {
				if strings.TrimSpace(v) != "" {
					return true, fmt.Sprintf("Pending file rename operations (%d files)", len(val))
				}
			}
		}
	}

	return false, ""
}
