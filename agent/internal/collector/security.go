package collector

import (
	"strings"

	"github.com/yusufpapurcu/wmi"
)

// AntivirusInfo represents an installed and registered antivirus product
type AntivirusInfo struct {
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
	UpToDate    bool   `json:"upToDate"`
	StateCode   uint32 `json:"stateCode"`
	Provider    string `json:"provider,omitempty"`
}

// FirewallInfo represents a registered firewall product
type FirewallInfo struct {
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
}

// FirewallProfiles represents the operational state of Windows Firewall per profile
type FirewallProfiles struct {
	Domain  bool `json:"domain"`
	Private bool `json:"private"`
	Public  bool `json:"public"`
}

// SecurityInfo holds operational security posture including AV, Defender, Firewall and individual profiles
type SecurityInfo struct {
	AntivirusList    []AntivirusInfo  `json:"antivirusList"`
	FirewallList     []FirewallInfo   `json:"firewallList"`
	FirewallProfiles FirewallProfiles `json:"firewallProfiles"`
	DefenderActive   bool             `json:"defenderActive"`
	DefenderUpdated  bool             `json:"defenderUpdated"`
	FirewallActive   bool             `json:"firewallActive"`
}

// HasEnabledAV returns true if any recognized antivirus is enabled
func (s *SecurityInfo) HasEnabledAV() bool {
	if s == nil {
		return false
	}
	if s.DefenderActive {
		return true
	}
	for _, av := range s.AntivirusList {
		if av.Enabled {
			return true
		}
	}
	return false
}

// PrimaryAVName returns the display name of the primary antivirus product
func (s *SecurityInfo) PrimaryAVName() string {
	if s == nil {
		return "Desconocido"
	}
	for _, av := range s.AntivirusList {
		if strings.TrimSpace(av.DisplayName) != "" {
			return strings.TrimSpace(av.DisplayName)
		}
	}
	return "Windows Defender"
}

type wmiAntiVirusProduct struct {
	DisplayName  string
	ProductState uint32
}

type wmiFirewallProduct struct {
	DisplayName  string
	ProductState uint32
}

// CollectSecurity queries security posture using available providers
func CollectSecurity() (*SecurityInfo, error) {
	sec := &SecurityInfo{
		AntivirusList: make([]AntivirusInfo, 0),
		FirewallList:  make([]FirewallInfo, 0),
		FirewallProfiles: FirewallProfiles{
			Domain:  true,
			Private: true,
			Public:  true,
		},
	}

	// 1. Collect from Windows Security Center 2 if applicable
	scProvider := &WindowsSecurityCenterProvider{}
	if scProvider.IsApplicable() {
		scSec, err := scProvider.Collect()
		if err == nil && scSec != nil {
			sec.AntivirusList = scSec.AntivirusList
			sec.FirewallList = scSec.FirewallList
			sec.DefenderActive = scSec.DefenderActive
			sec.DefenderUpdated = scSec.DefenderUpdated
			sec.FirewallActive = scSec.FirewallActive
		}
	}

	// 2. If no AV detected or Defender not reported via SecurityCenter2, check Defender registry fallback
	if len(sec.AntivirusList) == 0 || !sec.DefenderActive {
		defRegProvider := &WindowsDefenderRegistryProvider{}
		if defRegProvider.IsApplicable() {
			defSec, err := defRegProvider.Collect()
			if err == nil && defSec != nil && len(defSec.AntivirusList) > 0 {
				if len(sec.AntivirusList) == 0 {
					sec.AntivirusList = defSec.AntivirusList
					sec.DefenderActive = defSec.DefenderActive
					sec.DefenderUpdated = defSec.DefenderUpdated
				} else if defSec.DefenderActive {
					sec.DefenderActive = true
				}
			}
		}
	}

	// 3. Collect individual Firewall profile states (Domain, Private, Public)
	fwProfilesProvider := &WindowsFirewallProfilesProvider{}
	sec.FirewallProfiles = fwProfilesProvider.CollectProfiles()

	// Overall firewall active if at least the active profiles are enabled
	if !sec.FirewallActive {
		sec.FirewallActive = sec.FirewallProfiles.Domain && sec.FirewallProfiles.Private && sec.FirewallProfiles.Public
	}

	// If firewallList is empty, add Windows native firewall entries
	if len(sec.FirewallList) == 0 {
		sec.FirewallList = append(sec.FirewallList,
			FirewallInfo{DisplayName: "Windows Firewall (Domain)", Enabled: sec.FirewallProfiles.Domain},
			FirewallInfo{DisplayName: "Windows Firewall (Private)", Enabled: sec.FirewallProfiles.Private},
			FirewallInfo{DisplayName: "Windows Firewall (Public)", Enabled: sec.FirewallProfiles.Public},
		)
	}

	// Ensure DefenderActive flag is accurate based on AntivirusList
	for _, av := range sec.AntivirusList {
		if strings.Contains(strings.ToLower(av.DisplayName), "defender") {
			sec.DefenderActive = av.Enabled
			sec.DefenderUpdated = av.UpToDate
			break
		}
	}

	return sec, nil
}

// queryWmiNamespace queries WMI within a specific namespace such as root\SecurityCenter2
func queryWmiNamespace(namespace string, query string, dst interface{}) error {
	return wmi.QueryNamespace(query, dst, namespace)
}
