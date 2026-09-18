package actions

import (
	"regexp"
	"testing"
)

func TestActionContractHash(t *testing.T) {
	if got := len(actionHandlers); got != 24 {
		t.Fatalf("unexpected executable action count: got %d want 24", got)
	}

	services := canonicalAllowedServices()
	if got := len(services); got != 11 {
		t.Fatalf("unexpected canonical service count: got %d want 11 (%v)", got, services)
	}

	hash := ActionContractHash()
	if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(hash) {
		t.Fatalf("invalid contract hash: %q", hash)
	}
}
