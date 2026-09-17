package version

// These variables are set at build time via -ldflags
var (
	// Version is the semantic version of the agent
	Version = "1.3.0"
	// Commit is the git commit hash
	Commit = "unknown"
	// BuildDate is the date the binary was built
	BuildDate = "unknown"
)

// Info returns a formatted version string
func Info() string {
	return "v" + Version + " (commit: " + Commit + ", built: " + BuildDate + ")"
}

