package collector

import (
	"strings"

	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows/registry"
)

// AntivirusInfo represents an installed and registered antivirus product
type AntivirusInfo struct {
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
	UpToDate    bool   `json:"upToDate"`
	StateCode   uint32 `json:"stateCode"`
}

// FirewallInfo represents a registered firewall product or Windows Firewall
type FirewallInfo struct {
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
}

// SecurityInfo holds security posture including AV, Defender and Firewall
type SecurityInfo struct {
	AntivirusList   []AntivirusInfo `json:"antivirusList"`
	FirewallList    []FirewallInfo  `json:"firewallList"`
	DefenderActive  bool            `json:"defenderActive"`
	DefenderUpdated bool            `json:"defenderUpdated"`
	FirewallActive  bool            `json:"firewallActive"`
}

type wmiAntiVirusProduct struct {
	DisplayName  string
	ProductState uint32
}

type wmiFirewallProduct struct {
	DisplayName  string
	ProductState uint32
}

// CollectSecurity collects antivirus, defender and firewall statuses
func CollectSecurity() (*SecurityInfo, error) {
	sec := &SecurityInfo{
		AntivirusList: make([]AntivirusInfo, 0),
		FirewallList:  make([]FirewallInfo, 0),
	}

	// 1. Query Antivirus from root\SecurityCenter2
	var avList []wmiAntiVirusProduct
	queryAV := "SELECT DisplayName, ProductState FROM AntiVirusProduct"
	if err := queryWmiNamespace(`root\SecurityCenter2`, queryAV, &avList); err == nil {
		for _, av := range avList {
			name := strings.TrimSpace(av.DisplayName)
			if name == "" {
				continue
			}

			// In Windows SecurityCenter2:
			// productState is a bitfield:
			// (productState & 0x1000) != 0 -> Real-time protection / AV enabled
			// (productState & 0x0010) == 0 -> Definitions are up-to-date (0 = current, 0x10 = outdated)
			enabled := (av.ProductState & 0x1000) != 0
			upToDate := (av.ProductState & 0x0010) == 0

			if strings.Contains(strings.ToLower(name), "defender") {
				sec.DefenderActive = enabled
				sec.DefenderUpdated = upToDate
			}

			sec.AntivirusList = append(sec.AntivirusList, AntivirusInfo{
				DisplayName: name,
				Enabled:     enabled,
				UpToDate:    upToDate,
				StateCode:   av.ProductState,
			})
		}
	}

	// Fallback check for Defender in Registry if SecurityCenter2 didn't report it
	if len(sec.AntivirusList) == 0 {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows Defender`, registry.QUERY_VALUE)
		if err == nil {
			defer k.Close()
			sec.DefenderActive = true
			sec.DefenderUpdated = true
			sec.AntivirusList = append(sec.AntivirusList, AntivirusInfo{
				DisplayName: "Windows Defender",
				Enabled:     true,
				UpToDate:    true,
			})
		}
	}

	// 2. Query Firewall products from root\SecurityCenter2
	var fwList []wmiFirewallProduct
	queryFW := "SELECT DisplayName, ProductState FROM FirewallProduct"
	if err := queryWmiNamespace(`root\SecurityCenter2`, queryFW, &fwList); err == nil {
		for _, fw := range fwList {
			name := strings.TrimSpace(fw.DisplayName)
			if name == "" {
				continue
			}
			enabled := (fw.ProductState & 0x1000) != 0
			if enabled {
				sec.FirewallActive = true
			}
			sec.FirewallList = append(sec.FirewallList, FirewallInfo{
				DisplayName: name,
				Enabled:     enabled,
			})
		}
	}

	// 3. Check Windows Native Firewall via Registry if no third-party firewall registered
	if len(sec.FirewallList) == 0 {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile`, registry.QUERY_VALUE)
		if err == nil {
			defer k.Close()
			val, _, err := k.GetIntegerValue("EnableFirewall")
			fwEnabled := err == nil && val == 1
			sec.FirewallActive = fwEnabled
			sec.FirewallList = append(sec.FirewallList, FirewallInfo{
				DisplayName: "Windows Firewall (StandardProfile)",
				Enabled:     fwEnabled,
			})
		}
	}

	return sec, nil
}

// queryWmiNamespace queries WMI within a specific namespace such as root\SecurityCenter2
func queryWmiNamespace(namespace string, query string, dst interface{}) error {
	return wmi.QueryNamespace(query, dst, namespace)
}
