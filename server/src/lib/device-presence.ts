export const ONLINE_HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Derive connectivity from real agent heartbeats, never from enrollment or
 * unrelated telemetry. The latest heartbeat is also exposed as lastSeenAt so
 * the UI label "Último Heartbeat/Reporte" is truthful.
 */
export function applyDevicePresence(device: any, now: Date = new Date()): any {
  const rawHeartbeatAt = device?.heartbeats?.[0]?.timestamp;
  const heartbeatAt = rawHeartbeatAt ? new Date(rawHeartbeatAt) : null;
  const heartbeatMs = heartbeatAt?.getTime() ?? Number.NaN;
  const ageMs = now.getTime() - heartbeatMs;
  const online =
    Number.isFinite(heartbeatMs) &&
    ageMs >= -60_000 &&
    ageMs <= ONLINE_HEARTBEAT_THRESHOLD_MS;

  const heartbeatVersionRaw = device?.heartbeats?.[0]?.agentVersion;
  const heartbeatVersion =
    typeof heartbeatVersionRaw === 'string' && heartbeatVersionRaw.trim()
      ? heartbeatVersionRaw.replace(/^v/, '').trim()
      : null;

  const storedAgentVersion =
    typeof device?.agent?.agentVersion === 'string' && device.agent.agentVersion.trim()
      ? device.agent.agentVersion.replace(/^v/, '').trim()
      : null;

  // Runtime heartbeat is the source of truth for the version actually running
  // on the endpoint. Enrollment metadata is only a fallback when no heartbeat
  // has ever been received.
  const runtimeAgentVersion = heartbeatVersion || storedAgentVersion || null;
  const normalizedAgent = device?.agent
    ? {
        ...device.agent,
        agentVersion: runtimeAgentVersion,
      }
    : device?.agent;

  return {
    ...device,
    agent: normalizedAgent,
    runtimeAgentVersion,
    status: online ? 'ONLINE' : 'OFFLINE',
    connectionState: online ? 'ONLINE' : 'OFFLINE',
    lastHeartbeatAt: heartbeatAt,
    lastSeenAt: heartbeatAt,
  };
}
