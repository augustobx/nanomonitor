package transport

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strconv"
	"testing"
	"time"
)

func TestSignRequest(t *testing.T) {
	logger := slog.Default()
	client := NewClient("https://test.example.com/api", "agent-123", "secret-456", logger)

	body := []byte(`{"test":"data"}`)
	req, err := http.NewRequest("POST", "https://test.example.com/api/heartbeat", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	err = client.signRequest(req, body)
	if err != nil {
		t.Fatalf("failed to sign request: %v", err)
	}

	// Verify Authorization header
	auth := req.Header.Get("Authorization")
	if auth == "" {
		t.Fatal("Authorization header should not be empty")
	}
	if len(auth) < len("NanoAgent agent-123.") {
		t.Fatalf("Authorization header too short: %s", auth)
	}
	if auth[:len("NanoAgent ")] != "NanoAgent " {
		t.Errorf("Authorization should start with 'NanoAgent ', got %s", auth[:10])
	}

	// Verify timestamp
	timestamp := req.Header.Get("X-Nano-Timestamp")
	if timestamp == "" {
		t.Fatal("X-Nano-Timestamp should not be empty")
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		t.Fatalf("invalid timestamp: %v", err)
	}
	diff := time.Now().Unix() - ts
	if diff > 5 || diff < -5 {
		t.Errorf("timestamp should be within 5 seconds of now, diff=%d", diff)
	}

	// Verify nonce
	nonce := req.Header.Get("X-Nano-Nonce")
	if nonce == "" {
		t.Fatal("X-Nano-Nonce should not be empty")
	}
	if len(nonce) != 32 { // 16 bytes = 32 hex chars
		t.Errorf("nonce should be 32 hex chars, got %d", len(nonce))
	}

	// Verify HMAC is correct
	parts := auth[len("NanoAgent "):]
	dotIdx := len("agent-123")
	agentID := parts[:dotIdx]
	signature := parts[dotIdx+1:]

	if agentID != "agent-123" {
		t.Errorf("expected agentID 'agent-123', got %s", agentID)
	}

	// Recreate expected HMAC
	bodyHash := sha256.Sum256(body)
	bodyHashHex := hex.EncodeToString(bodyHash[:])
	message := timestamp + "\n" + bodyHashHex
	mac := hmac.New(sha256.New, []byte("secret-456"))
	mac.Write([]byte(message))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if signature != expectedSig {
		t.Errorf("HMAC signature mismatch:\n  got:      %s\n  expected: %s", signature, expectedSig)
	}
}

func TestGenerateNonce(t *testing.T) {
	nonce1, err := generateNonce()
	if err != nil {
		t.Fatalf("generateNonce failed: %v", err)
	}

	nonce2, err := generateNonce()
	if err != nil {
		t.Fatalf("generateNonce failed: %v", err)
	}

	if nonce1 == nonce2 {
		t.Error("two nonces should be different")
	}

	if len(nonce1) != 32 {
		t.Errorf("nonce should be 32 hex chars, got %d", len(nonce1))
	}
}
