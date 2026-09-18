import { z } from 'zod';

const thermalStatusSchema = z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'UNAVAILABLE']);

const thermalSensorSchema = z.object({
  name: z.string().min(1),
  temperatureC: z.number().min(-20).max(150),
  status: thermalStatusSchema,
  source: z.string().min(1),
});

const thermalInfoSchema = z.object({
  available: z.boolean(),
  status: thermalStatusSchema,
  cpu: thermalSensorSchema.nullable().optional(),
  gpus: z.array(thermalSensorSchema).optional().default([]),
});

export const agentHeartbeatSchema = z.object({
  agentVersion: z.string().min(1),
  timestamp: z.string().or(z.date()),
  uptimeSeconds: z.number().int().nonnegative().optional().default(0),
  status: z.string().default('healthy'),
  cpuPercent: z.number().min(0).max(100).optional(),
  ramUsedMb: z.number().int().nonnegative().optional(),
  ramAvailMb: z.number().int().nonnegative().optional(),
  diskSummary: z.any().optional(),
  deviceId: z.string().optional(),
  agentId: z.string().optional(),
  serverLatencyMs: z.number().optional(),
  security: z.any().optional(),
});

export const volumeSchema = z.object({
  letter: z.string(),
  label: z.string().optional(),
  fileSystem: z.string().optional(),
  totalBytes: z.number().optional(),
  freeBytes: z.number().optional(),
  usedBytes: z.number().optional(),
  usedPercent: z.number().optional(),
});

export const agentMetricsSchema = z.object({
  timestamp: z.string().or(z.date()),
  uptimeSeconds: z.number().int().nonnegative().optional(),
  uptimeSecs: z.number().int().nonnegative().optional(),
  cpuPercent: z.number().min(0).max(100),
  ramUsedMb: z.number().int().nonnegative().optional(),
  ramAvailMb: z.number().int().nonnegative().optional(),
  ramPercent: z.number().optional(),
  volumes: z.array(volumeSchema).optional(),
  thermal: thermalInfoSchema.optional(),
});

export const agentInventorySchema = z.object({
  collectedAt: z.string().datetime().optional(),
  identity: z.any().optional(),
  hardware: z.any().optional(),
  network: z.any().optional(),
  security: z.any().optional(),
  storage: z.any().optional(),
  smart: z.any().optional(),
  windowsUpdate: z.any().optional(),
});

export const agentSoftwareItemSchema = z.object({
  name: z.string(),
  version: z.string().optional().default(''),
  publisher: z.string().optional().default(''),
  installDate: z.string().optional().default(''),
  installLocation: z.string().optional().default(''),
  uninstallString: z.string().optional().default(''),
  architecture: z.string().optional().default('x64'),
});

export const agentSoftwareChangeSchema = z.object({
  action: z.enum(['INSTALLED', 'REMOVED', 'UPDATED']),
  software: agentSoftwareItemSchema,
  oldVersion: z.string().optional(),
});

export const agentSoftwareSchema = z.object({
  collectedAt: z.string().datetime().optional(),
  checksum: z.string(),
  count: z.number().int().nonnegative(),
  items: z.array(agentSoftwareItemSchema),
  changes: z.array(agentSoftwareChangeSchema).optional(),
});

export const agentSingleEventSchema = z.object({
  timestamp: z.string().or(z.date()),
  source: z.string(),
  category: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'HIGH', 'CRITICAL']),
  eventId: z.number().int().optional(),
  title: z.string(),
  description: z.string().optional(),
  rawData: z.any().optional(),
  dedupKey: z.string().min(1),
});

export const agentEventsSchema = z.union([
  z.array(agentSingleEventSchema),
  agentSingleEventSchema,
]);

export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;
export type AgentMetricsInput = z.infer<typeof agentMetricsSchema>;
export type AgentInventoryInput = z.infer<typeof agentInventorySchema>;
export type AgentEventInput = z.infer<typeof agentSingleEventSchema>;
