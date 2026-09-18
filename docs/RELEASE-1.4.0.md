# NanoMonitor 1.4.0

## Release scope

NanoMonitor 1.4.0 consolidates the hardened RMM/NOC agent produced during phases 1–7.5.

### Reliability
- Windows Service automatic delayed start and recovery.
- Truthful heartbeat-derived ONLINE/OFFLINE presence.
- Leased/idempotent remote action delivery and durable final results.
- Persistent offline telemetry buffer with recovery.
- Server/agent action contract hash handshake and drift protection.

### Security and Windows management
- Microsoft Defender inspection/remediation with post-verification.
- Windows Update discovery, install outcomes and post-action reconciliation.
- Per-update success/failure proof and reboot-state handling.

### Thermal telemetry
- Optional CPU/GPU temperature telemetry.
- CPU temperature is reported only from explicit hardware-monitor sensor providers.
- NVIDIA GPU temperature can also be read from `nvidia-smi`.
- Missing/unreliable sensors are reported as unavailable; NanoMonitor does not fabricate 0 °C readings.
- Thermal states:
  - NORMAL: below 80 °C
  - WARNING: 80–89.9 °C
  - CRITICAL: 90 °C or above
- Device performance view shows available CPU/GPU sensors and surfaces warning/critical thermal state.
- A real sensor reading at or above 90 °C opens a critical NanoMonitor alert; unavailable sensors never trigger one.
- The unified Windows installer executes an agent runtime self-check before registering the Windows service.

## Production build

From the repository root:

```bash
bash scripts/release-1.4.0.sh
```

The script validates/builds the server, builds the Windows agent and unified installer, publishes the installer under `downloads/`, deploys the API and verifies health before declaring success.
