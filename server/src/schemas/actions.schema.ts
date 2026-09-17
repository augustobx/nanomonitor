import { z } from 'zod';

export const ALLOWED_SERVICES_WHITELIST = [
  'Spooler',
  'wuauserv',
  'LanmanWorkstation',
  'LanmanServer',
  'Dnscache',
  'Dhcp',
  'W32Time',
  'Winmgmt',
  'TermService',
  'EventLog',
  'NanoLabsAgent',
] as const;

export type AllowedService = (typeof ALLOWED_SERVICES_WHITELIST)[number];

export const ACTION_TYPES = [
  'REBOOT_DEVICE',
  'SHUTDOWN_DEVICE',
  'FORCE_HEARTBEAT',
  'FORCE_METRICS',
  'FORCE_SECURITY_SCAN',
  'FORCE_INVENTORY',
  'FORCE_SMART_CHECK',
  'FORCE_WINDOWS_UPDATE',
  'DEFENDER_UPDATE_SIGNATURES',
  'DEFENDER_QUICK_SCAN',
  'DEFENDER_FULL_SCAN',
  'FLUSH_DNS',
  'RENEW_DHCP',
  'WINDOWS_SFC_SCAN',
  'WINDOWS_DISM_CHECK',
  'WINDOWS_CHKDSK_SCAN',
  'QUERY_SERVICES',
  'RESTART_SERVICE',
  'WINDOWS_UPDATE_SCAN',
  'WINDOWS_UPDATE_INSTALL_KB',
  'WINDOWS_UPDATE_INSTALL_APPROVED',
  'WINDOWS_UPDATE_SCHEDULE_REBOOT',
] as const;

export type ActionTypeEnum = (typeof ACTION_TYPES)[number];

export const createActionSchema = z
  .object({
    actionType: z.enum(ACTION_TYPES),
    parameters: z.record(z.any()).optional().default({}),
    expiresInMinutes: z.number().int().min(1).max(120).optional().default(15),
  })
  .superRefine((data, ctx) => {
    if (data.actionType === 'RESTART_SERVICE') {
      const serviceName = data.parameters?.serviceName;
      if (!serviceName || typeof serviceName !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parameters', 'serviceName'],
          message: 'serviceName is required for RESTART_SERVICE',
        });
      } else if (!ALLOWED_SERVICES_WHITELIST.includes(serviceName as any)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parameters', 'serviceName'],
          message: `Service "${serviceName}" is not in the allowed whitelist (${ALLOWED_SERVICES_WHITELIST.join(', ')})`,
        });
      }
    } else if (data.actionType === 'WINDOWS_UPDATE_INSTALL_KB') {
      const kbs = data.parameters?.kbArticleIds;
      if (!Array.isArray(kbs) || kbs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parameters', 'kbArticleIds'],
          message: 'kbArticleIds array with at least one KB is required for WINDOWS_UPDATE_INSTALL_KB',
        });
      }
    }
  });

export const updateActionStatusSchema = z.object({
  status: z.enum(['RUNNING', 'SUCCESS', 'FAILED']),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  exitCode: z.number().int().optional(),
  output: z.string().max(65536).optional(),
  error: z.string().max(16384).optional(),
  result: z.record(z.any()).optional(),
});

export const cancelActionSchema = z.object({
  reason: z.string().max(500).optional(),
});
