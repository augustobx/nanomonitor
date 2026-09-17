.PHONY: build build-release test clean install uninstall

# Build variables
VERSION ?= 1.2.0
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
LDFLAGS := -ldflags "-s -w \
	-X github.com/nanolabs/nanomonitor/agent/internal/version.Version=$(VERSION) \
	-X github.com/nanolabs/nanomonitor/agent/internal/version.Commit=$(COMMIT) \
	-X github.com/nanolabs/nanomonitor/agent/internal/version.BuildDate=$(BUILD_DATE)"

OUTPUT := bin/nanoagent.exe

# Development build
build:
	go build $(LDFLAGS) -o $(OUTPUT) ./cmd/nanoagent

# Release build (stripped, optimized)
build-release:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
	go build $(LDFLAGS) -trimpath -o $(OUTPUT) ./cmd/nanoagent

# Run tests
test:
	go test -v -race ./...

# Run tests with coverage
test-cover:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Format code
fmt:
	go fmt ./...

# Lint
lint:
	golangci-lint run ./...

# Tidy dependencies
tidy:
	go mod tidy

# Install service (requires admin)
install: build
	$(OUTPUT) -install -start

# Uninstall service (requires admin)
uninstall:
	$(OUTPUT) -uninstall
