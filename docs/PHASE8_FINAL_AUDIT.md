# NanoMonitor — Phase 8 Final Audit

Release candidate: **v1.4.5**

Baseline validated endpoint release: **v1.4.3**

## Scope

Final pre-production audit across:

- Windows agent and tray lifecycle
- Installer and local ACLs
- Enrollment and endpoint identity
- User and agent authentication
- HMAC request integrity and replay protection
- Tenant/customer/site isolation
- Remote action state machine
- Auto-remediation linkage
- Windows Update and reboot state
- Sensitive tamper/enrollment credentials
- Offline durability and replay
- Dashboard/live API secret exposure

## Closed findings

### Enrollment and identity
- Enrollment token consumption is transactional and serializable.
- One-shot/max-use tokens cannot be consumed concurrently beyond their limit.
- Hardware ID / serial identity reuse is resolved inside the enrollment transaction.
- Tenant device quota is checked inside the serialized enrollment path.
- Compatibility enrollment tokens are one-use, 24-hour, no-store, and creation is audited.

### Authentication
- Agent HMAC v2 binds method, request target, timestamp, nonce and body.
- Hardened agents cannot downgrade to legacy HMAC v1.
- Nonces are consumed only after successful signature validation.
- Suspended users or tenants are rejected on authenticated requests.
- Refresh rotation is atomic.
- Production configuration fails closed when security-critical configuration is unsafe.

### Tenant isolation
- Device/customer/site relationships are validated on moves.
- Alert evaluator reads are tenant scoped.
- Software compliance and hardware tamper lookups are tenant scoped.
- Patch policy ownership is tenant scoped.
- Auto-remediation derives customer scope from the persisted alert/device relationship.
- Broad dashboard payloads never expose the tamper unlock key.

### Remote actions
- Delivery/start/final transitions use compare-and-set semantics.
- Cancellation is race-safe.
- Stale RUNNING actions are reconciled after the execution lease.
- Late durable terminal reports from the endpoint can recover provisional lease-expiry failures.
- Auto-remediation receives authoritative SUCCESS/FAILED terminal status.
- Patch/reboot side state is reconciled with action truth.

### Tamper protection
- Tamper keys are generated centrally.
- Protected devices are guaranteed to have an unlock credential.
- Dedicated reveal endpoint is privileged, no-store, and audited.
- Heartbeat provisioning uses a conditional write to avoid concurrent first-key divergence.
- Heartbeat responses carrying tamper state are explicitly no-store.
- Local agent/tamper secrets are stored outside public config.yaml.

### Windows local security
- ProgramData root no longer grants inherited read access to every standard user.
- Credentials, offline queues, pending reports and internal watermarks inherit only SYSTEM/Administrators access.
- Only tray-safe state is explicitly readable by standard users:
  - config.yaml (without secrets)
  - logs
  - active_action.json
- active_action.json is rewritten with explicit read-only ACL for standard users.
- Installer migration ACL handling no longer recursively destroys child file ACLs.

### Tray and lifecycle
- Tray queries the Service Control Manager with read-only permissions suitable for a normal interactive user.
- Delayed service startup is reflected automatically after Windows boot.
- Tray version probes preserve stdout.
- Agent service remains Automatic (Delayed), LocalSystem, with configured recovery actions.

### Installer
- Enrollment tokens are not propagated in elevated/download URLs.
- Sensitive installer artifacts are no-store.
- Upgrade preserves endpoint identity and protected credentials.
- Installer verifies the service reaches a stable RUNNING state before success.

## Runtime validation already completed on v1.4.3

- Upgrade from previous hardened build
- Service RUNNING / Automatic (Delayed)
- Tray startup and delayed-state recovery
- FORCE_METRICS
- QUERY_SERVICES
- Defender Quick Scan
- Windows Update Scan
- ONLINE -> OFFLINE -> ONLINE presence
- Durable offline heartbeat/metrics buffering
- Service restart with queue pending
- Offline replay to zero remaining items
- Remote REBOOT_DEVICE
- Full Windows reboot
- Automatic service restart after reboot
- Tray automatically transitions to green without manual intervention

## v1.4.5 release gates

The final candidate must pass:

1. Server TypeScript/action-contract build.
2. Windows nanoagent and nanotray builds.
3. Installer build.
4. Published installer SHA-256 equals built installer SHA-256.
5. API health returns OK after deployment.
6. Upgrade reference endpoint v1.4.3 -> v1.4.5 returns installer exit code 0.
7. nanoagent and nanotray both report v1.4.5.
8. NanoLabsAgent is RUNNING / Automatic.
9. agent.secrets.json remains SYSTEM + Administrators only.
10. config.yaml contains no agentSecret/tamperKey.
11. buffer/pending internal state is not readable by standard users.
12. config/logs/active_action remain tray-readable.
13. One remote safe action reaches SUCCESS.
14. No duplicate endpoint is created after upgrade/reboot.

If all gates pass, v1.4.5 is the Phase 8 production candidate.


## Additional closure after 1.4.4 regression

- Generated CRM runtime is now parsed during every server build with node:vm.
- Inline onclick handlers from both initial HTML and dynamic runtime templates are checked for matching functions/bindings.
- The enrollment command template escaping regression that broke the CRM navigation was corrected.
- Silent installer mode no longer launches nanotray.exe as a persistent child process.
- This prevents PowerShell Start-Process -Wait / process-tree tracking from appearing hung after a successful unattended installation.
- Interactive installs still launch the tray immediately; silent installs rely on HKLM Run at next interactive logon.
