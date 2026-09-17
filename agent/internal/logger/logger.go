package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// Logger wraps slog.Logger with file rotation support
type Logger struct {
	*slog.Logger
	file *os.File
}

// New creates a new structured logger that writes to both stdout and a log file
func New(logFile string, level string) (*Logger, error) {
	// Parse log level
	var slogLevel slog.Level
	switch level {
	case "debug":
		slogLevel = slog.LevelDebug
	case "info":
		slogLevel = slog.LevelInfo
	case "warn":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}

	// Ensure log directory exists
	logDir := filepath.Dir(logFile)
	if err := os.MkdirAll(logDir, 0750); err != nil {
		return nil, fmt.Errorf("creating log directory: %w", err)
	}

	// Open log file with append mode
	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0640)
	if err != nil {
		return nil, fmt.Errorf("opening log file: %w", err)
	}

	// Always write to the file first. Windows services launched by the Service
	// Control Manager may not have a valid stdout handle; if stdout is the
	// first MultiWriter target, that error can prevent the file from receiving
	// the log entry at all.
	var writer io.Writer = f
	if _, statErr := os.Stdout.Stat(); statErr == nil {
		writer = io.MultiWriter(f, os.Stdout)
	}

	handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{
		Level: slogLevel,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Use ISO 8601 format for timestamps
			if a.Key == slog.TimeKey {
				a.Value = slog.StringValue(a.Value.Time().Format(time.RFC3339))
			}
			return a
		},
	})

	return &Logger{
		Logger: slog.New(handler),
		file:   f,
	}, nil
}

// Close closes the underlying log file
func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

// WithComponent returns a logger with a component field
func (l *Logger) WithComponent(component string) *slog.Logger {
	return l.Logger.With("component", component)
}
