import { createHash } from 'node:crypto';
import { ActionType } from '@prisma/client';
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
  'DEFENDER_ENABLE_PROTECTION',
  'FLUSH_DNS',
  'RENEW_DHCP',
  'WINDOWS_SFC_SCAN',
  'WINDOWS_DISM_CHECK',
  'WINDOWS_CHKDSK_SCAN',
  'QUERY_SERVICES',
  'RESTART_SERVICE',
  'CLEAN_TEMP_FILES',
  'WINDOWS_UPDATE_SCAN',
  'WINDOWS_UPDATE_INSTALL_KB',
  'WINDOWS_UPDATE_INSTALL_APPROVED',
  'WINDOWS_UPDATE_SCHEDULE_REBOOT',
] as const;

export type ActionTypeEnum = (typeof ACTION_TYPES)[number];

export const AGENT_REPORTABLE_ACTION_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'] as const;

export const ACTION_PARAMETER_CONTRACTS = [
  'RESTART_SERVICE:serviceName:string:required',
  'WINDOWS_UPDATE_INSTALL_KB:kbArticleIds:string[]:required',
  'WINDOWS_UPDATE_INSTALL_APPROVED:kbArticleIds:string[]:required',
  'WINDOWS_UPDATE_SCHEDULE_REBOOT:delaySeconds:number:optional,message:string:optional',
] as const;

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

const apiActionTypes = sorted(ACTION_TYPES);
const prismaActionTypes = sorted(Object.values(ActionType));

if (
  apiActionTypes.length !== prismaActionTypes.length ||
  apiActionTypes.some((value, index) => value !== prismaActionTypes[index])
) {
  const apiOnly = apiActionTypes.filter((value) => !prismaActionTypes.includes(value));
  const prismaOnly = prismaActionTypes.filter((value) => !apiActionTypes.includes(value));
  throw new Error(
    `ACTION CONTRACT DRIFT: API/Prisma mismatch. API-only=[${apiOnly.join(', ')}] Prisma-only=[${prismaOnly.join(', ')}]`
  );
}

export const ACTION_CONTRACT_SIGNATURE = [
  `actions:${apiActionTypes.join(',')}`,
  `statuses:${sorted(AGENT_REPORTABLE_ACTION_STATUSES).join(',')}`,
  `services:${sorted(ALLOWED_SERVICES_WHITELIST).join(',')}`,
  `params:${sorted(ACTION_PARAMETER_CONTRACTS).join(',')}`,
].join('\n');

export const ACTION_CONTRACT_HASH = createHash('sha256')
  .update(ACTION_CONTRACT_SIGNATURE, 'utf8')
  .digest('hex');

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
    } else if (
      data.actionType === 'WINDOWS_UPDATE_INSTALL_KB' ||
      data.actionType === 'WINDOWS_UPDATE_INSTALL_APPROVED'
    ) {
      const kbs = data.parameters?.kbArticleIds;
      if (!Array.isArray(kbs) || kbs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parameters', 'kbArticleIds'],
          message: `kbArticleIds array with at least one identifier is required for ${data.actionType}`,
        });
      }
    }
  });

export const updateActionStatusSchema = z.object({
  status: z.enum(AGENT_REPORTABLE_ACTION_STATUSES),
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
