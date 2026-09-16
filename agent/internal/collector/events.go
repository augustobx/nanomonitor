package collector

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// DeviceEventPayload represents an event to be sent to the API
type DeviceEventPayload struct {
	Timestamp   time.Time              `json:"timestamp"`
	Source      string                 `json:"source"`
	Category    string                 `json:"category"`
	Severity    string                 `json:"severity"` // CRITICAL | HIGH | WARNING | INFO
	EventID     int                    `json:"eventId,omitempty"`
	Title       string                 `json:"title"`
	Description string                 `json:"description,omitempty"`
	RawData     map[string]interface{} `json:"rawData,omitempty"`
	DedupKey    string                 `json:"dedupKey"`
}

// XML structures matching wevtutil output format
type xmlEventsWrapper struct {
	XMLName xml.Name   `xml:"Events"`
	Events  []xmlEvent `xml:"Event"`
}

type xmlEvent struct {
	System struct {
		Provider struct {
			Name string `xml:"Name,attr"`
		} `xml:"Provider"`
		EventID struct {
			ID int `xml:",chardata"`
		} `xml:"EventID"`
		Level struct {
			Val int `xml:",chardata"`
		} `xml:"Level"`
		TimeCreated struct {
			SystemTime string `xml:"SystemTime,attr"`
		} `xml:"TimeCreated"`
		EventRecordID struct {
			ID uint64 `xml:",chardata"`
		} `xml:"EventRecordID"`
		Channel  string `xml:"Channel"`
		Computer string `xml:"Computer"`
	} `xml:"System"`
	EventData struct {
		Data []struct {
			Name  string `xml:"Name,attr"`
			Value string `xml:",chardata"`
		} `xml:"Data"`
	} `xml:"EventData"`
}

// GetInitialHighestRecordIDs retrieves the current highest EventRecordID for System and Application
// so the agent does not upload historical events from weeks/months ago.
func GetInitialHighestRecordIDs() map[string]uint64 {
	result := make(map[string]uint64)
	channels := []string{"System", "Application"}

	for _, ch := range channels {
		id, err := queryHighestRecordID(ch)
		if err == nil && id > 0 {
			result[ch] = id
		}
	}
	return result
}

func queryHighestRecordID(channel string) (uint64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "wevtutil.exe", "qe", channel, "/c:1", "/rd:true", "/f:XML")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return 0, err
	}

	events, err := parseEventsXML(stdout.Bytes())
	if err != nil || len(events) == 0 {
		return 0, fmt.Errorf("no events returned")
	}

	return events[0].System.EventRecordID.ID, nil
}

// CollectRecentEvents queries Windows Event Log for new critical/warning events since the last known IDs
func CollectRecentEvents(lastRecordIDs map[string]uint64) ([]DeviceEventPayload, map[string]uint64, error) {
	var allPayloads []DeviceEventPayload
	updatedIDs := make(map[string]uint64)

	// Copy existing IDs
	for k, v := range lastRecordIDs {
		updatedIDs[k] = v
	}

	// 1. Query System Log
	sysLastID := lastRecordIDs["System"]
	sysEvents, maxSysID, err := queryChannelEvents("System", sysLastID)
	if err == nil {
		if maxSysID > sysLastID {
			updatedIDs["System"] = maxSysID
		}
		for _, e := range sysEvents {
			p := classifyEvent(e)
			if p != nil {
				allPayloads = append(allPayloads, *p)
			}
		}
	}

	// 2. Query Application Log
	appLastID := lastRecordIDs["Application"]
	appEvents, maxAppID, err := queryChannelEvents("Application", appLastID)
	if err == nil {
		if maxAppID > appLastID {
			updatedIDs["Application"] = maxAppID
		}
		for _, e := range appEvents {
			p := classifyEvent(e)
			if p != nil {
				allPayloads = append(allPayloads, *p)
			}
		}
	}

	return allPayloads, updatedIDs, nil
}

func queryChannelEvents(channel string, sinceRecordID uint64) ([]xmlEvent, uint64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var xpath string
	if channel == "System" {
		if sinceRecordID > 0 {
			xpath = fmt.Sprintf("*[System[(EventRecordID > %d) and (Level=1 or Level=2 or EventID=41 or EventID=1001 or EventID=55 or EventID=98 or EventID=7 or EventID=11 or EventID=15 or EventID=51 or EventID=7034)]]", sinceRecordID)
		} else {
			// If no baseline, take at most 10 recent critical/error events from the last day
			xpath = "*[System[(Level=1 or Level=2 or EventID=41 or EventID=1001 or EventID=55 or EventID=98)]]"
		}
	} else { // Application
		if sinceRecordID > 0 {
			xpath = fmt.Sprintf("*[System[(EventRecordID > %d) and (Level=1 or Level=2 or EventID=1000 or EventID=1001 or EventID=1002)]]", sinceRecordID)
		} else {
			xpath = "*[System[(Level=1 or Level=2 or EventID=1000 or EventID=1002)]]"
		}
	}

	args := []string{"qe", channel, "/q:" + xpath, "/f:XML", "/c:30", "/rd:false"}
	cmd := exec.CommandContext(ctx, "wevtutil.exe", args...)

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return nil, sinceRecordID, err
	}

	rawBytes := stdout.Bytes()
	if len(bytes.TrimSpace(rawBytes)) == 0 {
		return nil, sinceRecordID, nil
	}

	events, err := parseEventsXML(rawBytes)
	if err != nil {
		return nil, sinceRecordID, err
	}

	maxID := sinceRecordID
	for _, ev := range events {
		if ev.System.EventRecordID.ID > maxID {
			maxID = ev.System.EventRecordID.ID
		}
	}

	return events, maxID, nil
}

func parseEventsXML(rawBytes []byte) ([]xmlEvent, error) {
	// Wrap fragments into a single root element <Events>...</Events>
	wrapped := append([]byte("<Events>"), rawBytes...)
	wrapped = append(wrapped, []byte("</Events>")...)

	var root xmlEventsWrapper
	if err := xml.Unmarshal(wrapped, &root); err != nil {
		return nil, err
	}

	return root.Events, nil
}

// classifyEvent maps a raw Windows Event into a structured DeviceEventPayload
func classifyEvent(e xmlEvent) *DeviceEventPayload {
	eventID := e.System.EventID.ID
	level := e.System.Level.Val
	provider := strings.TrimSpace(e.System.Provider.Name)
	channel := strings.TrimSpace(e.System.Channel)

	var timestamp time.Time
	if e.System.TimeCreated.SystemTime != "" {
		t, err := time.Parse(time.RFC3339Nano, e.System.TimeCreated.SystemTime)
		if err == nil {
			timestamp = t
		} else {
			timestamp = time.Now().UTC()
		}
	} else {
		timestamp = time.Now().UTC()
	}

	// Extract data fields
	dataMap := make(map[string]interface{})
	for _, d := range e.EventData.Data {
		name := d.Name
		if name == "" {
			name = "param" + strconv.Itoa(len(dataMap)+1)
		}
		dataMap[name] = strings.TrimSpace(d.Value)
	}

	category := "System"
	severity := "INFO"
	title := fmt.Sprintf("Evento de Windows (%d)", eventID)
	description := fmt.Sprintf("Evento emitido por %s en el canal %s.", provider, channel)

	// Map Level: 1 = Critical, 2 = Error, 3 = Warning, 4 = Information
	switch level {
	case 1:
		severity = "CRITICAL"
	case 2:
		severity = "HIGH"
	case 3:
		severity = "WARNING"
	default:
		severity = "INFO"
	}

	// Specific high-priority Event IDs classification
	switch eventID {
	case 41: // Microsoft-Windows-Kernel-Power
		category = "KernelPower"
		severity = "CRITICAL"
		title = "Reinicio inesperado o corte de energía"
		description = "El sistema se reinició sin apagarse limpiamente primero. Puede deberse a un corte de energía, falla de hardware o cuelgue del equipo."
	case 1001: // BugCheck (System BSOD) or Windows Error Reporting
		if channel == "System" || strings.Contains(strings.ToLower(provider), "bugcheck") {
			category = "BugCheck"
			severity = "CRITICAL"
			title = "Pantalla Azul (BSOD) detectada"
			bugcheckCode := fmt.Sprintf("%v", dataMap["param1"])
			description = fmt.Sprintf("El equipo sufrió un reinicio por fallo crítico del sistema (BugCheck code: %s).", bugcheckCode)
		} else {
			category = "AppCrash"
			severity = "WARNING"
			title = "Reporte de error de aplicación"
			description = "Windows Error Reporting generó un volcado para una aplicación que presentó anomalías."
		}
	case 55, 98: // NTFS filesystem corruption
		category = "NTFS"
		severity = "CRITICAL"
		title = "Corrupción en sistema de archivos NTFS"
		description = "La estructura del sistema de archivos en el disco está dañada y no se puede usar. Se requiere chkdsk o inspección urgente."
	case 7, 11, 15, 51: // Disk error / bad block / paging error
		category = "DiskError"
		severity = "HIGH"
		title = "Error o bloque dañado en disco físico"
		description = fmt.Sprintf("El controlador de disco detectó un error de hardware o bloque defectuoso (EventID %d).", eventID)
	case 1000: // Application Error
		category = "AppCrash"
		severity = "HIGH"
		appName := fmt.Sprintf("%v", dataMap["param1"])
		appVer := fmt.Sprintf("%v", dataMap["param2"])
		if appName != "" && appName != "<nil>" {
			title = fmt.Sprintf("Cierre inesperado: %s", appName)
			description = fmt.Sprintf("La aplicación con fallas %s (versión %s) se cerró abruptamente.", appName, appVer)
		} else {
			title = "Cierre inesperado de aplicación (Crash)"
			description = "Una aplicación crítica terminó de manera inesperada."
		}
	case 1002: // Application Hang
		category = "AppCrash"
		severity = "WARNING"
		appName := fmt.Sprintf("%v", dataMap["param1"])
		if appName != "" && appName != "<nil>" {
			title = fmt.Sprintf("Aplicación bloqueada (Hang): %s", appName)
			description = fmt.Sprintf("El programa %s dejó de responder y fue cerrado por el sistema.", appName)
		} else {
			title = "Aplicación bloqueada (Hang)"
			description = "Un proceso del sistema dejó de responder."
		}
	case 7034: // Service Control Manager - Service crash
		category = "ServiceCrash"
		severity = "WARNING"
		svcName := fmt.Sprintf("%v", dataMap["param1"])
		title = fmt.Sprintf("Servicio detenido de forma inesperada: %s", svcName)
		description = fmt.Sprintf("El servicio de Windows %s terminó de forma inesperada.", svcName)
	case 7000: // Service Control Manager - Failed to start
		category = "ServiceCrash"
		severity = "WARNING"
		svcName := fmt.Sprintf("%v", dataMap["param1"])
		title = fmt.Sprintf("Falla al iniciar servicio: %s", svcName)
		description = fmt.Sprintf("El servicio %s no pudo iniciarse en el tiempo previsto.", svcName)
	case 20: // WindowsUpdateClient installation failure
		category = "WindowsUpdate"
		severity = "WARNING"
		updateTitle := fmt.Sprintf("%v", dataMap["updateTitle"])
		title = "Error al instalar actualización de Windows"
		description = fmt.Sprintf("Falló la instalación del paquete: %s", updateTitle)
	default:
		if strings.Contains(strings.ToLower(provider), "disk") || strings.Contains(strings.ToLower(provider), "stornvme") {
			category = "DiskError"
		} else if strings.Contains(strings.ToLower(provider), "kernel") {
			category = "KernelPower"
		}
	}

	// Generate deduplication key
	// Format: EventViewer:{Channel}:{Category}:{EventID}:{ExtraKey}
	extraKey := ""
	if dataMap["param1"] != nil && dataMap["param1"] != "" {
		extraKey = fmt.Sprintf(":%v", dataMap["param1"])
	}
	dedupKey := fmt.Sprintf("EventViewer:%s:%s:%d%s", channel, category, eventID, extraKey)

	return &DeviceEventPayload{
		Timestamp:   timestamp,
		Source:      "EventViewer",
		Category:    category,
		Severity:    severity,
		EventID:     eventID,
		Title:       title,
		Description: description,
		RawData:     dataMap,
		DedupKey:    dedupKey,
	}
}
