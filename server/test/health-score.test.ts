import { describe, it, expect } from 'vitest';
import { calculateDeviceHealthScore } from '../src/modules/health/health-scorer.js';

describe('Health Score Engine (Fase 8)', () => {
  it('should award a perfect 100 score to a clean, healthy machine', () => {
    const score = calculateDeviceHealthScore({
      status: 'ONLINE',
      lastSeenAt: new Date(),
      cpuName: '11th Gen Intel Core i5-11400 @ 2.60GHz',
      cpuCores: 6,
      ramTotalMB: 16384,
      latestMetric: {
        cpuPercent: 15,
        ramUsedMB: 6000,
        ramAvailMB: 10384,
        uptimeSeconds: 86400,
        volumes: [
          { driveLetter: 'C:', label: 'System', freeBytes: 500 * 1024 * 1024 * 1024, totalBytes: 1000 * 1024 * 1024 * 1024, freePercent: 50 }
        ],
      },
      latestInventory: {
        storage: {
          disks: [{ friendlyName: 'KINGSTON NVMe', healthStatus: 'Healthy', sizeGb: 1000 }],
        },
        security: {
          defenderActive: true,
          firewallActive: true,
          antivirusList: [{ displayName: 'Windows Defender', enabled: true }],
        },
        windowsUpdate: {
          rebootPending: false,
          recentHotfixes: [{ hotfixId: 'KB5034441', installedOn: '2026-09-10' }],
        },
      },
      recentEvents: [],
    });

    expect(score.overall).toBe(100);
    expect(score.status).toBe('OPTIMAL');
    expect(score.statusLabel).toBe('ÓPTIMO');
    expect(score.penalties).toHaveLength(0);
    expect(score.performance).toBe(100);
    expect(score.storage).toBe(100);
    expect(score.security).toBe(100);
    expect(score.updates).toBe(100);
    expect(score.stability).toBe(100);
    expect(score.hardware).toBe(100);
  });

  it('should penalize performance when CPU is critically saturated (> 85%)', () => {
    const score = calculateDeviceHealthScore({
      status: 'ONLINE',
      cpuCores: 6,
      ramTotalMB: 16384,
      latestMetric: {
        cpuPercent: 92,
        ramUsedMB: 6000,
        ramAvailMB: 10384,
      },
      latestInventory: {
        storage: { disks: [{ healthStatus: 'Healthy' }] },
        security: { defenderActive: true, firewallActive: true },
        windowsUpdate: { rebootPending: false, recentHotfixes: [{ hotfixId: 'KB1' }] },
      },
    });

    expect(score.performance).toBe(50);
    expect(score.overall).toBeLessThan(100);
    expect(score.penalties.some(p => p.code === 'CPU_CRITICAL_LOAD')).toBe(true);
  });

  it('should penalize storage when a disk reports SMART degradation', () => {
    const score = calculateDeviceHealthScore({
      status: 'ONLINE',
      cpuCores: 6,
      ramTotalMB: 16384,
      latestInventory: {
        storage: {
          disks: [{ friendlyName: 'Corrupted NVMe', healthStatus: 'Degraded' }],
        },
        security: { defenderActive: true, firewallActive: true },
        windowsUpdate: { rebootPending: false, recentHotfixes: [{ hotfixId: 'KB1' }] },
      },
    });

    expect(score.storage).toBe(30);
    expect(score.penalties.some(p => p.code === 'SMART_DEGRADED')).toBe(true);
  });

  it('should penalize updates when a reboot is pending', () => {
    const score = calculateDeviceHealthScore({
      status: 'ONLINE',
      cpuCores: 6,
      ramTotalMB: 16384,
      latestInventory: {
        storage: { disks: [{ healthStatus: 'Healthy' }] },
        security: { defenderActive: true, firewallActive: true },
        windowsUpdate: { rebootPending: true, rebootReason: 'Pending file rename operations', recentHotfixes: [{ hotfixId: 'KB1' }] },
      },
    });

    expect(score.updates).toBe(35);
    expect(score.penalties.some(p => p.code === 'REBOOT_PENDING')).toBe(true);
  });

  it('should mark an offline machine as CRITICAL with stability penalty', () => {
    const score = calculateDeviceHealthScore({
      status: 'OFFLINE',
      cpuCores: 6,
      ramTotalMB: 16384,
    });

    expect(score.status).toBe('CRITICAL');
    expect(score.stability).toBe(20);
    expect(score.penalties.some(p => p.code === 'DEVICE_OFFLINE')).toBe(true);
  });

  it('should penalize multiple critical Windows events', () => {
    const score = calculateDeviceHealthScore({
      status: 'ONLINE',
      cpuCores: 6,
      ramTotalMB: 16384,
      recentEvents: [
        { severity: 'CRITICAL', eventId: 41, occurrences: 2 },
        { severity: 'CRITICAL', eventId: 1001, occurrences: 1 },
      ],
      latestInventory: {
        storage: { disks: [{ healthStatus: 'Healthy' }] },
        security: { defenderActive: true, firewallActive: true },
        windowsUpdate: { rebootPending: false, recentHotfixes: [{ hotfixId: 'KB1' }] },
      },
    });

    expect(score.stability).toBe(40);
    expect(score.penalties.some(p => p.code === 'MULTIPLE_CRITICAL_EVENTS')).toBe(true);
  });
});
