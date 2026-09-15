package collector

import (
	"testing"
)

func TestCollectIdentity(t *testing.T) {
	info, err := CollectIdentity()
	if err != nil {
		t.Fatalf("CollectIdentity failed: %v", err)
	}

	// Hostname must always be present
	if info.Hostname == "" {
		t.Error("hostname should not be empty")
	}

	// Architecture should be set
	if info.Architecture == "" {
		t.Error("architecture should not be empty")
	}

	// Timezone should be set
	if info.Timezone == "" {
		t.Error("timezone should not be empty")
	}

	// OS edition should be present on Windows
	if info.OSEdition == "" {
		t.Error("OS edition should not be empty on Windows")
	}

	// OS version should be present
	if info.OSVersion == "" {
		t.Error("OS version should not be empty on Windows")
	}

	t.Logf("Identity: hostname=%s, manufacturer=%s, model=%s, os=%s, arch=%s",
		info.Hostname, info.Manufacturer, info.Model, info.OSEdition, info.Architecture)
}

func TestCollectHardware(t *testing.T) {
	info, err := CollectHardware()
	if err != nil {
		t.Fatalf("CollectHardware failed: %v", err)
	}

	// CPU
	if info.CPU.Name == "" {
		t.Error("CPU name should not be empty")
	}
	if info.CPU.Cores <= 0 {
		t.Errorf("CPU cores should be > 0, got %d", info.CPU.Cores)
	}
	if info.CPU.LogicalCores <= 0 {
		t.Errorf("CPU logical cores should be > 0, got %d", info.CPU.LogicalCores)
	}

	// RAM
	if info.RAM.TotalMB <= 0 {
		t.Errorf("RAM total should be > 0, got %d MB", info.RAM.TotalMB)
	}

	// Disks (should have at least one)
	if len(info.Disks) == 0 {
		t.Error("should have at least one disk")
	}
	for i, d := range info.Disks {
		if d.Model == "" {
			t.Errorf("disk %d: model should not be empty", i)
		}
		if d.SizeGB <= 0 {
			t.Errorf("disk %d: size should be > 0, got %d GB", i, d.SizeGB)
		}
	}

	t.Logf("Hardware: CPU=%s (%d cores), RAM=%d MB, Disks=%d",
		info.CPU.Name, info.CPU.Cores, info.RAM.TotalMB, len(info.Disks))
}

func TestCollectPerformance(t *testing.T) {
	perf, err := CollectPerformance()
	if err != nil {
		t.Fatalf("CollectPerformance failed: %v", err)
	}

	// CPU percent should be 0-100
	if perf.CPUPercent < 0 || perf.CPUPercent > 100 {
		t.Errorf("CPU percent should be 0-100, got %.2f", perf.CPUPercent)
	}

	// RAM should be positive
	if perf.RAMUsedMB <= 0 {
		t.Errorf("RAM used should be > 0, got %d", perf.RAMUsedMB)
	}
	if perf.RAMAvailMB < 0 {
		t.Errorf("RAM available should be >= 0, got %d", perf.RAMAvailMB)
	}

	// Should have at least one volume
	if len(perf.Volumes) == 0 {
		t.Error("should have at least one volume")
	}

	for _, v := range perf.Volumes {
		if v.TotalGB <= 0 {
			t.Errorf("volume %s: total should be > 0", v.Letter)
		}
		if v.Percent < 0 || v.Percent > 100 {
			t.Errorf("volume %s: percent should be 0-100, got %.2f", v.Letter, v.Percent)
		}
	}

	// Uptime should be positive
	if perf.UptimeSecs <= 0 {
		t.Errorf("uptime should be > 0, got %d", perf.UptimeSecs)
	}

	t.Logf("Performance: CPU=%.1f%%, RAM=%d/%d MB (%.1f%%), Uptime=%ds, Volumes=%d",
		perf.CPUPercent, perf.RAMUsedMB, perf.RAMUsedMB+perf.RAMAvailMB,
		perf.RAMPercent, perf.UptimeSecs, len(perf.Volumes))
}

func TestCollectNetwork(t *testing.T) {
	net, err := CollectNetwork()
	if err != nil {
		t.Fatalf("CollectNetwork failed: %v", err)
	}

	// Should have at least one interface with IP enabled
	if len(net.Interfaces) == 0 {
		t.Error("should have at least one network interface")
	}

	for _, iface := range net.Interfaces {
		if iface.Name == "" {
			t.Error("interface name should not be empty")
		}
		t.Logf("Interface: %s, IPs=%v, Gateway=%s, DNS=%v, Status=%s",
			iface.Name, iface.IPAddresses, iface.Gateway, iface.DNSServers, iface.Status)
	}

	t.Logf("Internet reachable: %v", net.InternetReachable)
}

func TestClassifyMediaType(t *testing.T) {
	tests := []struct {
		wmiType  string
		model    string
		expected string
	}{
		{"", "Samsung SSD 870 EVO", "SSD"},
		{"", "NVMe Samsung 980 PRO", "NVMe"},
		{"Fixed hard disk media", "WDC WD10EZEX", "HDD"},
		{"", "Kingston A2000 NVMe", "NVMe"},
		{"Removable Media", "USB Flash Drive", "Removable"},
	}

	for _, tc := range tests {
		result := classifyMediaType(tc.wmiType, tc.model)
		if result != tc.expected {
			t.Errorf("classifyMediaType(%q, %q) = %q, expected %q",
				tc.wmiType, tc.model, result, tc.expected)
		}
	}
}
