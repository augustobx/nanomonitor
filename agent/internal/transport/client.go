package transport

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/nanolabs/nanomonitor/agent/internal/collector"
)

// Client handles HTTP communication with the NanoLabs API
type Client struct {
	httpClient  *http.Client
	baseURL     string
	agentID     string
	agentSecret string
	logger      *slog.Logger
}

// NewClient creates a new transport client
func NewClient(baseURL, agentID, agentSecret string, logger *slog.Logger) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL:     baseURL,
		agentID:     agentID,
		agentSecret: agentSecret,
		logger:      logger,
	}
}

// HeartbeatPayload is the data sent in heartbeat requests
type HeartbeatPayload struct {
	DeviceID        string                  `json:"deviceId,omitempty"`
	AgentID         string                  `json:"agentId,omitempty"`
	AgentVersion    string                  `json:"agentVersion"`
	Timestamp       time.Time               `json:"timestamp"`
	UptimeSeconds   int64                   `json:"uptimeSeconds"`
	Status          string                  `json:"status"`
	ServerLatencyMs int64                   `json:"serverLatencyMs,omitempty"`
	CPUPercent      float64                 `json:"cpuPercent"`
	RAMUsedMB       int                     `json:"ramUsedMb"`
	RAMAvailMB      int                     `json:"ramAvailMb"`
	DiskSummary     interface{}             `json:"diskSummary,omitempty"`
	Security        *collector.SecurityInfo `json:"security,omitempty"`
}

// Response represents a generic API response
type Response struct {
	StatusCode int
	Body       []byte
}

// EnrollRequest is sent during device enrollment
type EnrollRequest struct {
	Token        string      `json:"token"`
	Hostname     string      `json:"hostname"`
	HardwareID   string      `json:"hardwareId,omitempty"`
	AgentVersion string      `json:"agentVersion,omitempty"`
	OSInfo       interface{} `json:"osInfo,omitempty"`
}

// EnrollResponse is returned after successful enrollment
type EnrollResponse struct {
	AgentID     string `json:"agentId"`
	AgentSecret string `json:"agentSecret"`
	DeviceID    string `json:"deviceId"`
	TenantID    string `json:"tenantId"`
	Config      map[string]interface{} `json:"config,omitempty"`
}

// SendHeartbeat sends a heartbeat to the API
func (c *Client) SendHeartbeat(ctx context.Context, payload *HeartbeatPayload) (*Response, error) {
	return c.sendAuthenticatedJSON(ctx, "POST", "/agent/heartbeat", payload)
}

// SendMetrics sends performance metrics to the API
func (c *Client) SendMetrics(ctx context.Context, payload interface{}) (*Response, error) {
	return c.sendAuthenticatedJSON(ctx, "POST", "/agent/metrics", payload)
}

// SendInventory sends a device inventory snapshot to the API
func (c *Client) SendInventory(ctx context.Context, payload interface{}) (*Response, error) {
	return c.sendAuthenticatedJSON(ctx, "POST", "/agent/inventory", payload)
}

// SendSoftware sends software inventory snapshot and delta changes to the API
func (c *Client) SendSoftware(ctx context.Context, payload interface{}) (*Response, error) {
	return c.sendAuthenticatedJSON(ctx, "POST", "/agent/software", payload)
}

// SendEvents sends device events to the API
func (c *Client) SendEvents(ctx context.Context, payload interface{}) (*Response, error) {
	return c.sendAuthenticatedJSON(ctx, "POST", "/agent/events", payload)
}

// ActionItem represents an action received from the server
type ActionItem struct {
	ID          string                 `json:"id"`
	ActionType  string                 `json:"actionType"`
	Parameters  map[string]interface{} `json:"parameters"`
	IssuedAt    string                 `json:"issuedAt"`
	ExpiresAt   string                 `json:"expiresAt"`
	RequestedBy string                 `json:"requestedBy"`
}

// PollActionsResponse is the API response for /agent/actions/poll
type PollActionsResponse struct {
	Status     string       `json:"status"`
	Actions    []ActionItem `json:"actions"`
	ServerTime string       `json:"serverTime"`
}

// ActionStatusReport is sent by the agent when updating status or reporting completion
type ActionStatusReport struct {
	Status     string                 `json:"status"`
	StartedAt  string                 `json:"startedAt,omitempty"`
	FinishedAt string                 `json:"finishedAt,omitempty"`
	ExitCode   *int                   `json:"exitCode,omitempty"`
	Output     string                 `json:"output,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Result     map[string]interface{} `json:"result,omitempty"`
}

// PollActions queries the server for pending remote actions
func (c *Client) PollActions(ctx context.Context, waitSeconds int) ([]ActionItem, error) {
	path := fmt.Sprintf("/agent/actions/poll?wait=%d", waitSeconds*1000)
	resp, err := c.sendAuthenticatedJSON(ctx, "POST", path, map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("polling actions returned status: %d", resp.StatusCode)
	}

	var pollResp PollActionsResponse
	if err := json.Unmarshal(resp.Body, &pollResp); err != nil {
		return nil, fmt.Errorf("unmarshaling poll response: %w", err)
	}
	return pollResp.Actions, nil
}

// ReportActionStatus reports the status or completion of an action
func (c *Client) ReportActionStatus(ctx context.Context, actionID string, report *ActionStatusReport) error {
	path := fmt.Sprintf("/agent/actions/%s/status", actionID)
	resp, err := c.sendAuthenticatedJSON(ctx, "POST", path, report)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reporting action status returned: %d", resp.StatusCode)
	}
	return nil
}

// Enroll sends an enrollment request (no agent auth, uses token auth)
func (c *Client) Enroll(ctx context.Context, req *EnrollRequest) (*EnrollResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling enrollment request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/enrollment/register", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating enrollment request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sending enrollment request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading enrollment response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("enrollment failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	var enrollResp EnrollResponse
	if err := json.Unmarshal(respBody, &enrollResp); err != nil {
		return nil, fmt.Errorf("parsing enrollment response: %w", err)
	}

	return &enrollResp, nil
}

// sendAuthenticatedJSON sends an HMAC-authenticated JSON request
func (c *Client) sendAuthenticatedJSON(ctx context.Context, method, path string, payload interface{}) (*Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshaling payload: %w", err)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add HMAC authentication
	if err := c.signRequest(req, body); err != nil {
		return nil, fmt.Errorf("signing request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	return &Response{
		StatusCode: resp.StatusCode,
		Body:       respBody,
	}, nil
}

// signRequest adds HMAC-SHA256 authentication headers
func (c *Client) signRequest(req *http.Request, body []byte) error {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce, err := generateNonce()
	if err != nil {
		return fmt.Errorf("generating nonce: %w", err)
	}

	// HMAC = SHA256(timestamp + "\n" + SHA256(body), agentSecret)
	bodyHash := sha256.Sum256(body)
	bodyHashHex := hex.EncodeToString(bodyHash[:])

	message := timestamp + "\n" + bodyHashHex
	mac := hmac.New(sha256.New, []byte(c.agentSecret))
	mac.Write([]byte(message))
	signature := hex.EncodeToString(mac.Sum(nil))

	req.Header.Set("Authorization", "NanoAgent "+c.agentID+"."+signature)
	req.Header.Set("X-Nano-Timestamp", timestamp)
	req.Header.Set("X-Nano-Nonce", nonce)

	return nil
}

func generateNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// SendWithRetry sends a request with exponential backoff retry
func (c *Client) SendWithRetry(ctx context.Context, fn func(ctx context.Context) (*Response, error), maxRetries int) (*Response, error) {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt-1))) * time.Second
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}
			c.logger.Debug("retrying request",
				"attempt", attempt,
				"backoff", backoff.String(),
			)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
			}
		}

		resp, err := fn(ctx)
		if err != nil {
			lastErr = err
			c.logger.Warn("request failed",
				"attempt", attempt,
				"error", err,
			)
			continue
		}

		// Don't retry client errors (4xx), only server errors (5xx)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return resp, nil
		}
		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("server error: %d", resp.StatusCode)
			continue
		}

		return resp, nil
	}

	return nil, fmt.Errorf("all %d retries exhausted: %w", maxRetries, lastErr)
}
