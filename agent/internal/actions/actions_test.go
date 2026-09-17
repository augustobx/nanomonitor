package actions

import (
	"context"
	"testing"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

type mockHook struct {
	heartbeatTriggered bool
	metricsTriggered   bool
	securityTriggered  bool
	inventoryTriggered bool
	smartTriggered     bool
	wuTriggered        bool
}

func (m *mockHook) TriggerHeartbeat(ctx context.Context)     { m.heartbeatTriggered = true }
func (m *mockHook) TriggerMetrics(ctx context.Context)       { m.metricsTriggered = true }
func (m *mockHook) TriggerSecurity(ctx context.Context)      { m.securityTriggered = true }
func (m *mockHook) TriggerInventory(ctx context.Context)     { m.inventoryTriggered = true }
func (m *mockHook) TriggerSmart(ctx context.Context)         { m.smartTriggered = true }
func (m *mockHook) TriggerWindowsUpdate(ctx context.Context) { m.wuTriggered = true }

func TestServiceWhitelist(t *testing.T) {
	// 1. Allowed services
	allowed := []string{"Spooler", "spooler", "  wuauserv  ", "LanmanWorkstation", "EventLog", "NanoLabsAgent"}
	for _, name := range allowed {
		canonical, ok := IsServiceAllowed(name)
		if !ok {
			t.Errorf("expected service '%s' to be allowed", name)
		}
		if canonical == "" {
			t.Errorf("expected non-empty canonical name for '%s'", name)
		}
	}

	// 2. Disallowed services
	disallowed := []string{"cmd", "powershell", "evilservice", "svchost", "explorer", "malware", ""}
	for _, name := range disallowed {
		_, ok := IsServiceAllowed(name)
		if ok {
			t.Errorf("expected service '%s' to be rejected by whitelist", name)
		}
	}
}

func TestActionExpiration(t *testing.T) {
	// Expired action
	expiredAction := &transport.ActionItem{
		ID:        "act-1",
		ExpiresAt: time.Now().Add(-1 * time.Minute).Format(time.RFC3339),
	}
	if !IsActionExpired(expiredAction) {
		t.Errorf("expected action to be detected as expired")
	}

	// Valid action
	validAction := &transport.ActionItem{
		ID:        "act-2",
		ExpiresAt: time.Now().Add(10 * time.Minute).Format(time.RFC3339),
	}
	if IsActionExpired(validAction) {
		t.Errorf("expected action to be valid, not expired")
	}
}

func TestForceHooksExecution(t *testing.T) {
	hook := &mockHook{}
	ctx := context.Background()

	// 1. Force Heartbeat
	res := ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_HEARTBEAT"}, hook)
	if res.ExitCode != 0 || !hook.heartbeatTriggered {
		t.Errorf("FORCE_HEARTBEAT failed or did not trigger hook")
	}

	// 2. Force Metrics
	res = ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_METRICS"}, hook)
	if res.ExitCode != 0 || !hook.metricsTriggered {
		t.Errorf("FORCE_METRICS failed or did not trigger hook")
	}

	// 3. Force Security
	res = ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_SECURITY_SCAN"}, hook)
	if res.ExitCode != 0 || !hook.securityTriggered {
		t.Errorf("FORCE_SECURITY_SCAN failed or did not trigger hook")
	}

	// 4. Force Inventory
	res = ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_INVENTORY"}, hook)
	if res.ExitCode != 0 || !hook.inventoryTriggered {
		t.Errorf("FORCE_INVENTORY failed or did not trigger hook")
	}

	// 5. Force SMART
	res = ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_SMART_CHECK"}, hook)
	if res.ExitCode != 0 || !hook.smartTriggered {
		t.Errorf("FORCE_SMART_CHECK failed or did not trigger hook")
	}

	// 6. Force Windows Update
	res = ExecuteAction(ctx, &transport.ActionItem{ActionType: "FORCE_WINDOWS_UPDATE"}, hook)
	if res.ExitCode != 0 || !hook.wuTriggered {
		t.Errorf("FORCE_WINDOWS_UPDATE failed or did not trigger hook")
	}
}

func TestDisallowedServiceRestart(t *testing.T) {
	ctx := context.Background()
	hook := &mockHook{}

	action := &transport.ActionItem{
		ActionType: "RESTART_SERVICE",
		Parameters: map[string]interface{}{
			"serviceName": "unauthorized_malicious_svc",
		},
	}

	res := ExecuteAction(ctx, action, hook)
	if res.ExitCode == 0 {
		t.Errorf("expected RESTART_SERVICE with unauthorized service to fail with non-zero exit code")
	}
	if res.Error == "" {
		t.Errorf("expected error message explaining whitelist rejection")
	}
}

func TestUnknownActionRejection(t *testing.T) {
	ctx := context.Background()
	hook := &mockHook{}

	action := &transport.ActionItem{
		ActionType: "ARBITRARY_REMOTE_SHELL",
	}

	res := ExecuteAction(ctx, action, hook)
	if res.ExitCode == 0 {
		t.Errorf("expected arbitrary action type to be rejected")
	}
}
