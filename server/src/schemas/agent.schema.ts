import { z } from 'zod';

export const agentHeartbeatSchema = z.object({
  agentVersion: z.string().min(1),
  timestamp: z.string().or(z.date()),
  uptimeSeconds: z.number().int().nonnegative(),
  status: z.string().default('healthy'),
  cpuPercent: z.number().min(0).max(100),
  ramUsedMb: z.number().int().nonnegative(),
  ramAvailMb: z.number().int().nonnegative(),
  diskSummary: z.any().optional(),
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
});

export const agentInventorySchema = z.object({
  identity: z.any().optional(),
  hardware: z.any().optional(),
  network: z.any().optional(),
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
