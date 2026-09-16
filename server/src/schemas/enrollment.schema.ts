import { z } from 'zod';

export const createTokenSchema = z.object({
  customerId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  maxUses: z.number().int().min(1).default(1),
  expiresInHours: z.number().int().min(1).max(720).default(24),
});

export const registerAgentSchema = z.object({
  token: z.string().min(5),
  hostname: z.string().min(1).max(255),
  hardwareId: z.string().nullable().optional(),
  osInfo: z
    .record(z.any())
    .nullable()
    .optional(),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
