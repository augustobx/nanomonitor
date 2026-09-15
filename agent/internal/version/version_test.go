package version

import (
	"strings"
	"testing"
)

func TestInfo(t *testing.T) {
	info := Info()
	if info == "" {
		t.Fatal("version info should not be empty")
	}
	if !strings.Contains(info, Version) {
		t.Errorf("version info should contain version %s, got %s", Version, info)
	}
	if !strings.Contains(info, "commit:") {
		t.Errorf("version info should contain commit, got %s", info)
	}
	if !strings.Contains(info, "built:") {
		t.Errorf("version info should contain build date, got %s", info)
	}
}

func TestDefaultVersion(t *testing.T) {
	if Version == "" {
		t.Fatal("default version should not be empty")
	}
}
