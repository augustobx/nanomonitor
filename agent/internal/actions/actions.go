package actions

import (
	"strings"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/transport"
)

// AllowedServicesWhitelist defines safe Windows services that can be queried or restarted
var AllowedServicesWhitelist = map[string]string{
	"spooler":           "Spooler",
	"wuauserv":          "wuauserv",
	"lanmanworkstation": "LanmanWorkstation",
	"lanmanserver":      "LanmanServer",
	"dnscache":          "Dnscache",
	"dhcp":              "Dhcp",
	"w32time":           "W32Time",
	"winmgmt":           "Winmgmt",
	"termservice":       "TermService",
	"eventlog":          "EventLog",
	"nanolabsagent":     "NanoLabsAgent",
}

// IsServiceAllowed checks if a service name is in the whitelist and returns normalized name
func IsServiceAllowed(serviceName string) (string, bool) {
	norm := strings.ToLower(strings.TrimSpace(serviceName))
	canonical, ok := AllowedServicesWhitelist[norm]
	return canonical, ok
}

// IsActionExpired returns true if the action's expiresAt has passed
func IsActionExpired(action *transport.ActionItem) bool {
	if action.ExpiresAt == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, action.ExpiresAt)
	if err != nil {
		return false
	}
	return time.Now().After(t)
}
