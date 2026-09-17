package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadConfigTamperKey(t *testing.T) {
	tempDir := t.TempDir()
	cfgPath := filepath.Join(tempDir, "config.yaml")

	// Case 1: File doesn't exist
	if key := readConfigTamperKey(cfgPath); key != "" {
		t.Fatalf("expected empty key, got %q", key)
	}

	// Case 2: Config without tamperKey
	_ = os.WriteFile(cfgPath, []byte("apiUrl: https://monitor.nanolabs.com.ar\nagentId: 1234\n"), 0644)
	if key := readConfigTamperKey(cfgPath); key != "" {
		t.Fatalf("expected empty key, got %q", key)
	}

	// Case 3: Config with plain tamperKey
	_ = os.WriteFile(cfgPath, []byte("apiUrl: https://monitor.nanolabs.com.ar\ntamperKey: NL-9XLJ-MUYM\n"), 0644)
	if key := readConfigTamperKey(cfgPath); key != "NL-9XLJ-MUYM" {
		t.Fatalf("expected NL-9XLJ-MUYM, got %q", key)
	}

	// Case 4: Config with quoted tamperKey
	_ = os.WriteFile(cfgPath, []byte("apiUrl: https://monitor.nanolabs.com.ar\ntamperKey: \"NL-ABCD-EFGH\"\n"), 0644)
	if key := readConfigTamperKey(cfgPath); key != "NL-ABCD-EFGH" {
		t.Fatalf("expected NL-ABCD-EFGH, got %q", key)
	}
}
