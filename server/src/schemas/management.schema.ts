import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.string().default('PROFESSIONAL'),
  maxDevices: z.number().int().positive().default(100),
  contactEmail: z.string().email(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(20).toUpperCase(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createSiteSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(2).max(100),
  address: z.string().optional(),
  city: z.string().optional(),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
});

export const updateSiteSchema = createSiteSchema.partial();

export const updateDeviceSchema = z.object({
  displayName: z.string().max(100).optional(),
  customerId: z.string().uuid().optional(),
  siteId: z.string().uuid().nullable().optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'WARNING', 'CRITICAL', 'MAINTENANCE']).optional(),
});
