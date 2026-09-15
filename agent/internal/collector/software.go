package collector

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// SoftwareItem represents an installed application on Windows
type SoftwareItem struct {
	Name            string `json:"name"`
	Version         string `json:"version"`
	Publisher       string `json:"publisher"`
	InstallDate     string `json:"installDate"`
	InstallLocation string `json:"installLocation,omitempty"`
	UninstallString string `json:"uninstallString,omitempty"`
	Architecture    string `json:"architecture"` // "x64", "x86", "user"
}

// SoftwareChange represents an addition, removal, or version update of an app
type SoftwareChange struct {
	Action      string       `json:"action"` // "INSTALLED", "REMOVED", "UPDATED"
	Software    SoftwareItem `json:"software"`
	OldVersion  string       `json:"oldVersion,omitempty"`
}

// SoftwareInventory holds the full inventory and its checksum
type SoftwareInventory struct {
	Checksum string         `json:"checksum"`
	Count    int            `json:"count"`
	Items    []SoftwareItem `json:"items"`
}

type registryTarget struct {
	root registry.Key
	path string
	arch string
}

// CollectSoftware scans 64-bit, 32-bit (WOW6432Node), and CurrentUser registry uninstall keys
func CollectSoftware() (*SoftwareInventory, error) {
	targets := []registryTarget{
		{root: registry.LOCAL_MACHINE, path: `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, arch: "x64"},
		{root: registry.LOCAL_MACHINE, path: `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`, arch: "x86"},
		{root: registry.CURRENT_USER, path: `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, arch: "user"},
	}

	seen := make(map[string]bool)
	var items []SoftwareItem

	for _, target := range targets {
		scanned := scanRegistryKey(target.root, target.path, target.arch)
		for _, item := range scanned {
			key := strings.ToLower(item.Name + "|" + item.Architecture)
			if seen[key] {
				continue
			}
			seen[key] = true
			items = append(items, item)
		}
	}

	// Sort deterministically by Name ascending
	sort.Slice(items, func(i, j int) bool {
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	checksum := CalculateSoftwareChecksum(items)

	return &SoftwareInventory{
		Checksum: checksum,
		Count:    len(items),
		Items:    items,
	}, nil
}

func scanRegistryKey(root registry.Key, path string, arch string) []SoftwareItem {
	var results []SoftwareItem

	k, err := registry.OpenKey(root, path, registry.ENUMERATE_SUB_KEYS|registry.QUERY_VALUE)
	if err != nil {
		return results
	}
	defer k.Close()

	subkeys, err := k.ReadSubKeyNames(-1)
	if err != nil {
		return results
	}

	for _, sub := range subkeys {
		subKey, err := registry.OpenKey(k, sub, registry.QUERY_VALUE)
		if err != nil {
			continue
		}

		// Filter out system components
		if sysComp, _, err := subKey.GetIntegerValue("SystemComponent"); err == nil && sysComp == 1 {
			subKey.Close()
			continue
		}

		// Filter out Windows Updates / Hotfixes (typically KBxxxxxx or have ParentKeyName)
		if parentKey, _, err := subKey.GetStringValue("ParentKeyName"); err == nil && parentKey != "" {
			subKey.Close()
			continue
		}

		displayName, _, err := subKey.GetStringValue("DisplayName")
		if err != nil || strings.TrimSpace(displayName) == "" {
			subKey.Close()
			continue
		}
		displayName = strings.TrimSpace(displayName)

		// Filter out pure KB update entries
		if strings.HasPrefix(strings.ToUpper(displayName), "KB") && len(displayName) <= 10 {
			subKey.Close()
			continue
		}

		displayVersion, _, _ := subKey.GetStringValue("DisplayVersion")
		publisher, _, _ := subKey.GetStringValue("Publisher")
		installDate, _, _ := subKey.GetStringValue("InstallDate")
		installLocation, _, _ := subKey.GetStringValue("InstallLocation")
		uninstallString, _, _ := subKey.GetStringValue("UninstallString")

		subKey.Close()

		results = append(results, SoftwareItem{
			Name:            displayName,
			Version:         strings.TrimSpace(displayVersion),
			Publisher:       strings.TrimSpace(publisher),
			InstallDate:     strings.TrimSpace(installDate),
			InstallLocation: strings.TrimSpace(installLocation),
			UninstallString: strings.TrimSpace(uninstallString),
			Architecture:    arch,
		})
	}

	return results
}

// CalculateSoftwareChecksum generates a deterministic SHA256 digest of installed apps and versions
func CalculateSoftwareChecksum(items []SoftwareItem) string {
	h := sha256.New()
	for _, item := range items {
		line := fmt.Sprintf("%s|%s|%s\n", strings.ToLower(item.Name), item.Version, item.Architecture)
		h.Write([]byte(line))
	}
	return hex.EncodeToString(h.Sum(nil))
}

// ComputeSoftwareDelta calculates installed, removed, and updated software comparing old vs new
func ComputeSoftwareDelta(previous, current []SoftwareItem) []SoftwareChange {
	prevMap := make(map[string]SoftwareItem)
	for _, p := range previous {
		key := strings.ToLower(p.Name + "|" + p.Architecture)
		prevMap[key] = p
	}

	currMap := make(map[string]SoftwareItem)
	var changes []SoftwareChange

	for _, c := range current {
		key := strings.ToLower(c.Name + "|" + c.Architecture)
		currMap[key] = c

		if old, exists := prevMap[key]; !exists {
			changes = append(changes, SoftwareChange{
				Action:   "INSTALLED",
				Software: c,
			})
		} else if old.Version != c.Version && (old.Version != "" || c.Version != "") {
			changes = append(changes, SoftwareChange{
				Action:     "UPDATED",
				Software:   c,
				OldVersion: old.Version,
			})
		}
	}

	for key, old := range prevMap {
		if _, exists := currMap[key]; !exists {
			changes = append(changes, SoftwareChange{
				Action:   "REMOVED",
				Software: old,
			})
		}
	}

	return changes
}
