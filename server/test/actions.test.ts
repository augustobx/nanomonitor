import { describe, it, expect } from 'vitest';
import {
  createActionSchema,
  updateActionStatusSchema,
  ALLOWED_SERVICES_WHITELIST,
} from '../src/schemas/actions.schema.js';
import {
  getRequiredPermissionForAction,
  hasPermission,
} from '../src/middleware/user-auth.js';

describe('Remote Actions Schema & Whitelist Validation', () => {
  it('should accept valid safe action without parameters', () => {
    const result = createActionSchema.safeParse({
      actionType: 'FORCE_HEARTBEAT',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionType).toBe('FORCE_HEARTBEAT');
      expect(result.data.expiresInMinutes).toBe(15);
    }
  });

  it('should reject unknown action types', () => {
    const result = createActionSchema.safeParse({
      actionType: 'EXECUTE_POWERSHELL_SCRIPT',
    });
    expect(result.success).toBe(false);
  });

  it('should accept RESTART_SERVICE when service is in whitelist', () => {
    for (const svc of ALLOWED_SERVICES_WHITELIST) {
      const result = createActionSchema.safeParse({
        actionType: 'RESTART_SERVICE',
        parameters: { serviceName: svc },
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject RESTART_SERVICE when serviceName is missing or disallowed', () => {
    const missing = createActionSchema.safeParse({
      actionType: 'RESTART_SERVICE',
      parameters: {},
    });
    expect(missing.success).toBe(false);

    const disallowed = createActionSchema.safeParse({
      actionType: 'RESTART_SERVICE',
      parameters: { serviceName: 'arbitrary_service' },
    });
    expect(disallowed.success).toBe(false);
  });

  it('should validate updateActionStatusSchema', () => {
    const valid = updateActionStatusSchema.safeParse({
      status: 'SUCCESS',
      exitCode: 0,
      output: 'Command completed successfully',
      result: { ok: true },
    });
    expect(valid.success).toBe(true);

    const invalidStatus = updateActionStatusSchema.safeParse({
      status: 'INVALID_STATUS',
    });
    expect(invalidStatus.success).toBe(false);
  });
});

describe('Remote Actions RBAC Permissions', () => {
  it('should map actions to expected permissions', () => {
    expect(getRequiredPermissionForAction('REBOOT_DEVICE')).toBe('RUN_REBOOT');
    expect(getRequiredPermissionForAction('SHUTDOWN_DEVICE')).toBe('RUN_REBOOT');
    expect(getRequiredPermissionForAction('DEFENDER_QUICK_SCAN')).toBe('RUN_SECURITY_ACTION');
    expect(getRequiredPermissionForAction('DEFENDER_UPDATE_SIGNATURES')).toBe('RUN_SECURITY_ACTION');
    expect(getRequiredPermissionForAction('WINDOWS_SFC_SCAN')).toBe('RUN_SYSTEM_ACTION');
    expect(getRequiredPermissionForAction('WINDOWS_DISM_CHECK')).toBe('RUN_SYSTEM_ACTION');
    expect(getRequiredPermissionForAction('RESTART_SERVICE')).toBe('RUN_SYSTEM_ACTION');
    expect(getRequiredPermissionForAction('FORCE_HEARTBEAT')).toBe('RUN_SAFE_ACTION');
    expect(getRequiredPermissionForAction('FLUSH_DNS')).toBe('RUN_SAFE_ACTION');
    expect(getRequiredPermissionForAction('QUERY_SERVICES')).toBe('RUN_SAFE_ACTION');
  });

  it('should enforce role boundaries', () => {
    // SUPER_ADMIN and ADMIN have full access
    expect(hasPermission('SUPER_ADMIN', 'RUN_REBOOT')).toBe(true);
    expect(hasPermission('ADMIN', 'RUN_REBOOT')).toBe(true);
    expect(hasPermission('ADMIN', 'RUN_SYSTEM_ACTION')).toBe(true);

    // TECHNICIAN can run safe, security, and system actions, but NOT reboot
    expect(hasPermission('TECHNICIAN', 'RUN_SAFE_ACTION')).toBe(true);
    expect(hasPermission('TECHNICIAN', 'RUN_SECURITY_ACTION')).toBe(true);
    expect(hasPermission('TECHNICIAN', 'RUN_SYSTEM_ACTION')).toBe(true);
    expect(hasPermission('TECHNICIAN', 'RUN_REBOOT')).toBe(false);
    expect(hasPermission('TECHNICIAN', 'ADMIN_ACTIONS')).toBe(false);

    // VIEWER and CLIENT can only view
    expect(hasPermission('VIEWER', 'VIEW_DEVICE')).toBe(true);
    expect(hasPermission('VIEWER', 'RUN_SAFE_ACTION')).toBe(false);
    expect(hasPermission('CLIENT', 'RUN_SAFE_ACTION')).toBe(false);
    expect(hasPermission('CLIENT', 'RUN_REBOOT')).toBe(false);
  });
});
