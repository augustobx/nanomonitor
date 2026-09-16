package collector

import (
	"strings"

	"golang.org/x/sys/windows/registry"
)

// SecurityProvider defines an abstraction for security posture data sources
// allowing future extensions (Defender specifics, Windows Server, 3rd party AV agents)
type SecurityProvider interface {
	Name() string
	IsApplicable() bool
	Collect() (*SecurityInfo, error)
}

// WindowsSecurityCenterProvider queries root\SecurityCenter2 on Windows 10/11
type WindowsSecurityCenterProvider struct{}

func (p *WindowsSecurityCenterProvider) Name() string {
	return "WindowsSecurityCenter2"
}

func (p *WindowsSecurityCenterProvider) IsApplicable() bool {
	// Root\SecurityCenter2 is present on Windows 10/11 Desktop editions
	var testList []wmiAntiVirusProduct
	err := queryWmiNamespace(`root\SecurityCenter2`, "SELECT DisplayName FROM AntiVirusProduct", &testList)
	return err == nil
}

func (p *WindowsSecurityCenterProvider) Collect() (*SecurityInfo, error) {
	sec := &SecurityInfo{
		AntivirusList: make([]AntivirusInfo, 0),
		FirewallList:  make([]FirewallInfo, 0),
	}

	// Query Antivirus products
	var avList []wmiAntiVirusProduct
	queryAV := "SELECT DisplayName, ProductState FROM AntiVirusProduct"
	if err := queryWmiNamespace(`root\SecurityCenter2`, queryAV, &avList); err == nil {
		for _, av := range avList {
			name := strings.TrimSpace(av.DisplayName)
			if name == "" {
				continue
			}

			// In Windows SecurityCenter2 bitfield:
			// (productState & 0x1000) != 0 -> Real-time protection / AV enabled
			// (productState & 0x0010) == 0 -> Definitions up to date (0 = current, 0x10 = outdated)
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
				Provider:    p.Name(),
			})
		}
	}

	// Query Firewall products
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

	return sec, nil
}

// WindowsDefenderRegistryProvider inspects Microsoft Defender registry settings
// Useful on Windows Server where SecurityCenter2 is unavailable, or as a reliable fallback
type WindowsDefenderRegistryProvider struct{}

func (p *WindowsDefenderRegistryProvider) Name() string {
	return "WindowsDefenderRegistry"
}

func (p *WindowsDefenderRegistryProvider) IsApplicable() bool {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows Defender`, registry.QUERY_VALUE)
	if err == nil {
		k.Close()
		return true
	}
	return false
}

func (p *WindowsDefenderRegistryProvider) Collect() (*SecurityInfo, error) {
	sec := &SecurityInfo{
		AntivirusList: make([]AntivirusInfo, 0),
		FirewallList:  make([]FirewallInfo, 0),
	}

	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows Defender`, registry.QUERY_VALUE)
	if err != nil {
		return sec, err
	}
	defer k.Close()

	// Check if DisableAntiSpyware or DisableAntiVirus is set to 1
	disabledVal, _, err := k.GetIntegerValue("DisableAntiSpyware")
	isSpywareDisabled := err == nil && disabledVal == 1

	rtpKey, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows Defender\Real-Time Protection`, registry.QUERY_VALUE)
	isRtpDisabled := false
	if err == nil {
		defer rtpKey.Close()
		rtpVal, _, errRtp := rtpKey.GetIntegerValue("DisableRealtimeMonitoring")
		if errRtp == nil && rtpVal == 1 {
			isRtpDisabled = true
		}
	}

	isActive := !isSpywareDisabled && !isRtpDisabled
	sec.DefenderActive = isActive
	sec.DefenderUpdated = true

	sec.AntivirusList = append(sec.AntivirusList, AntivirusInfo{
		DisplayName: "Windows Defender",
		Enabled:     isActive,
		UpToDate:    true,
		Provider:    p.Name(),
	})

	return sec, nil
}

// WindowsFirewallProfilesProvider inspects individual Domain, Private, and Public profiles
type WindowsFirewallProfilesProvider struct{}

func (p *WindowsFirewallProfilesProvider) Name() string {
	return "WindowsFirewallProfiles"
}

func (p *WindowsFirewallProfilesProvider) IsApplicable() bool {
	return true
}

func (p *WindowsFirewallProfilesProvider) CollectProfiles() FirewallProfiles {
	profiles := FirewallProfiles{
		Domain:  true,
		Private: true,
		Public:  true,
	}

	basePath := `SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy`

	// DomainProfile
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE, basePath+`\DomainProfile`, registry.QUERY_VALUE); err == nil {
		defer k.Close()
		if val, _, err := k.GetIntegerValue("EnableFirewall"); err == nil {
			profiles.Domain = (val == 1)
		}
	}

	// StandardProfile (Private)
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE, basePath+`\StandardProfile`, registry.QUERY_VALUE); err == nil {
		defer k.Close()
		if val, _, err := k.GetIntegerValue("EnableFirewall"); err == nil {
			profiles.Private = (val == 1)
		}
	}

	// PublicProfile
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE, basePath+`\PublicProfile`, registry.QUERY_VALUE); err == nil {
		defer k.Close()
		if val, _, err := k.GetIntegerValue("EnableFirewall"); err == nil {
			profiles.Public = (val == 1)
		}
	}

	return profiles
}
