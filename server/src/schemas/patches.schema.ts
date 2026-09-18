import { z } from 'zod';

export const PATCH_CATEGORIES = [
  'CRITICAL',
  'SECURITY',
  'IMPORTANT',
  'OPTIONAL',
  'DRIVER',
  'FEATURE_UPDATE',
  'OTHER',
] as const;

export const PATCH_SEVERITIES = [
  'CRITICAL',
  'IMPORTANT',
  'MODERATE',
  'LOW',
  'UNSPECIFIED',
] as const;

export const PATCH_APPROVAL_RULES = ['AUTO', 'MANUAL', 'IGNORE'] as const;

export const PATCH_STATUSES = [
  'MISSING',
  'PENDING_DOWNLOAD',
  'DOWNLOADED',
  'INSTALLING',
  'INSTALLED',
  'FAILED',
  'SUPERSEDED',
] as const;

export type PatchCategory = (typeof PATCH_CATEGORIES)[number];
export type PatchSeverity = (typeof PATCH_SEVERITIES)[number];
export type PatchApprovalRule = (typeof PATCH_APPROVAL_RULES)[number];
export type PatchStatus = (typeof PATCH_STATUSES)[number];

export const upsertPatchPolicySchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    name: z.string().min(2).max(100).optional().default('Política de Parches'),
    description: z.string().max(500).optional(),
    isDefault: z.boolean().optional().default(false),
    criticalApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('AUTO'),
    securityApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('AUTO'),
    importantApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('MANUAL'),
    optionalApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('IGNORE'),
    driverApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('MANUAL'),
    featureApproval: z.enum(PATCH_APPROVAL_RULES).optional().default('MANUAL'),
    maintenanceDays: z.array(z.string()).optional().default(['Sunday']),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().default('02:00'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().default('05:00'),
    timezone: z.string().optional().default('America/Argentina/Buenos_Aires'),
    allowReboot: z.boolean().optional().default(false),
    rebootDeadlineHours: z.number().int().min(1).max(168).optional().default(24),
    notificationDelayMin: z.number().int().min(1).max(120).optional().default(15),
    // Frontend aliases
    criticalRule: z.string().optional(),
    securityRule: z.string().optional(),
    importantRule: z.string().optional(),
    driverRule: z.string().optional(),
    featureRule: z.string().optional(),
    maintenanceWindowCron: z.string().optional(),
    maintenanceWindowDurationMins: z.number().optional(),
    autoReboot: z.boolean().optional(),
    rebootGracePeriodMins: z.number().optional(),
  })
  .transform((data) => {
    function normRule(val?: string, fallback: PatchApprovalRule = 'MANUAL'): PatchApprovalRule {
      if (!val) return fallback;
      if (val === 'AUTO_APPROVE' || val === 'AUTO') return 'AUTO';
      if (val === 'IGNORE') return 'IGNORE';
      return 'MANUAL';
    }

    return {
      ...data,
      name: data.name || (data.customerId ? 'Política de Cliente' : 'Política Global Predeterminada'),
      criticalApproval: normRule(data.criticalRule, data.criticalApproval),
      securityApproval: normRule(data.securityRule, data.securityApproval),
      importantApproval: normRule(data.importantRule, data.importantApproval),
      driverApproval: normRule(data.driverRule, data.driverApproval),
      featureApproval: normRule(data.featureRule, data.featureApproval),
      allowReboot: data.autoReboot ?? data.allowReboot,
      notificationDelayMin: data.rebootGracePeriodMins ?? data.notificationDelayMin,
    };
  });

export type UpsertPatchPolicyInput = z.infer<typeof upsertPatchPolicySchema>;

export const patchItemReportSchema = z.object({
  kbArticleId: z.string().min(2).max(50).transform((v) => v.trim().toUpperCase()),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  category: z.enum(PATCH_CATEGORIES).default('OTHER'),
  severity: z.enum(PATCH_SEVERITIES).default('UNSPECIFIED'),
  status: z.enum(PATCH_STATUSES).default('MISSING'),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  installedAt: z.string().datetime().nullable().optional(),
  requiresReboot: z.boolean().default(false),
  updateId: z.string().max(100).optional(),
  lastAttemptAt: z.string().datetime().optional(),
  lastOperation: z.string().max(32).optional(),
  lastResultCode: z.number().int().optional(),
  lastHResult: z.string().max(64).optional(),
});

export const reportDevicePatchesSchema = z.object({
  patches: z.array(patchItemReportSchema),
  rebootPending: z.boolean().default(false),
  rebootReason: z.string().optional(),
  scannedAt: z.string().datetime().optional(),
});

export type ReportDevicePatchesInput = z.infer<typeof reportDevicePatchesSchema>;

export const downloadPatchesRequestSchema = z.object({
  kbArticleIds: z.array(z.string().min(2)).min(1),
});
export type DownloadPatchesRequestInput = z.infer<typeof downloadPatchesRequestSchema>;

export const installPatchesRequestSchema = z.object({
  mode: z.enum(['SELECTED_KBS', 'CRITICAL_ONLY', 'SECURITY_ONLY', 'ALL_APPROVED']).default('SELECTED_KBS'),
  kbArticleIds: z.array(z.string().min(2)).optional().default([]),
  allowReboot: z.boolean().optional().default(false),
});

export type InstallPatchesRequestInput = z.infer<typeof installPatchesRequestSchema>;

export const scheduleRebootRequestSchema = z.object({
  delayMinutes: z.number().int().min(1).max(1440).default(15),
  message: z.string().max(255).optional().default('NanoLabs Control Center: Reinicio programado para aplicar actualizaciones de seguridad.'),
});

export type ScheduleRebootRequestInput = z.infer<typeof scheduleRebootRequestSchema>;
