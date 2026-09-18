import { AlertStatus, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface BlacklistEvaluationResult {
  unauthorizedAppsCount: number;
  matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    category: string;
    severity: Severity;
    appName: string;
    appVersion?: string;
  }>;
}

export const DEFAULT_BLACKLIST_RULES = [
  {
    name: 'Clientes P2P y Descarga Torrents',
    pattern: 'torrent|bittorrent|utorrent|qbittorrent|deluge|transmission|vuze',
    category: 'P2P_TORRENT',
    severity: Severity.HIGH,
    description: 'Clientes de descarga BitTorrent y redes P2P no permitidas por política de seguridad.',
  },
  {
    name: 'Herramientas de Control Remoto No Homologadas',
    pattern: 'teamviewer|anydesk|logmein|radmin|supremo|ultraviewer',
    category: 'UNAUTHORIZED_REMOTE',
    severity: Severity.HIGH,
    description: 'Software de acceso remoto externo no supervisado por el NOC central.',
  },
  {
    name: 'Minería de Criptomonedas & Hijackers',
    pattern: 'xmrig|nicehash|minergate|cryptominer|ethminer|cgminer|bfgminer',
    category: 'CRYPTO_MINER',
    severity: Severity.CRITICAL,
    description: 'Herramientas de criptominería que degradan hardware y exponen la red corporativa.',
  },
  {
    name: 'Plataformas de Juegos en Estaciones Laborales',
    pattern: 'steam|epic games|riot client|battlenet|blizzard|origin|uplay',
    category: 'GAMING',
    severity: Severity.WARNING,
    description: 'Plataformas recreativas instaladas en equipos corporativos.',
  },
];

export class SoftwareComplianceService {
  /**
   * Seeds default enterprise blacklist rules for a tenant if none exist
   */
  static async ensureDefaultBlacklistRules(tenantId?: string): Promise<void> {
    try {
      const tenants = tenantId
        ? [{ id: tenantId }]
        : await db.tenant.findMany({ select: { id: true } });

      for (const t of tenants) {
        for (const r of DEFAULT_BLACKLIST_RULES) {
          const exists = await db.softwareBlacklistRule.findFirst({
            where: { tenantId: t.id, name: r.name },
          });

          if (!exists) {
            await db.softwareBlacklistRule.create({
              data: {
                tenantId: t.id,
                name: r.name,
                pattern: r.pattern,
                category: r.category,
                severity: r.severity,
                description: r.description,
                enabled: true,
                autoAlert: true,
              },
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to seed default software blacklist rules');
    }
  }

  /**
   * Evaluates software inventory items against tenant blacklist rules,
   * triggering alerts when unauthorized applications are detected.
   */
  static async evaluateSoftwareCompliance(
    tenantId: string,
    deviceId: string,
    items: Array<{ name: string; publisher?: string; version?: string }>
  ): Promise<BlacklistEvaluationResult> {
    const result: BlacklistEvaluationResult = {
      unauthorizedAppsCount: 0,
      matchedRules: [],
    };

    if (!items || items.length === 0) return result;

    const rules = await db.softwareBlacklistRule.findMany({
      where: { tenantId, enabled: true },
    });

    if (rules.length === 0) return result;

    const device = await db.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { hostname: true, customerId: true },
    });

    if (!device) return result;

    for (const rule of rules) {
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, 'i');
      } catch {
        continue;
      }

      for (const item of items) {
        const appName = item.name || '';
        if (regex.test(appName)) {
          result.unauthorizedAppsCount++;
          result.matchedRules.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            severity: rule.severity,
            appName,
            appVersion: item.version,
          });

          // Trigger Alert if autoAlert is enabled
          if (rule.autoAlert) {
            const existingAlert = await db.alert.findFirst({
              where: {
                tenantId,
                deviceId,
                title: `Software No Autorizado: ${appName}`,
                status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
              },
            });

            if (!existingAlert) {
              const now = new Date();
              await db.alert.create({
                data: {
                  tenantId,
                  deviceId,
                  customerId: device.customerId,
                  severity: rule.severity,
                  status: AlertStatus.OPEN,
                  title: `Software No Autorizado: ${appName}`,
                  description: `Se detectó la aplicación prohibida "${appName}" (Versión: ${item.version || 'No especificada'}) en ${device.hostname}. Infringe la política "${rule.name}" (${rule.category}).`,
                  source: 'engine:software_compliance',
                  firstSeenAt: now,
                  lastSeenAt: now,
                  occurrences: 1,
                },
              });

              logger.warn(
                { deviceId, hostname: device.hostname, appName, rule: rule.name },
                `🚨 Unauthorized Software Alert triggered: ${appName} on ${device.hostname}`
              );
            }
          }
        }
      }
    }

    return result;
  }

  // Blacklist Rules Management CRUD
  static async getBlacklistRules(tenantId: string) {
    return db.softwareBlacklistRule.findMany({
      where: { tenantId },
      include: { customer: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createBlacklistRule(
    tenantId: string,
    data: {
      name: string;
      pattern: string;
      category: string;
      severity?: Severity;
      description?: string;
      customerId?: string;
    }
  ) {
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, tenantId },
        select: { id: true },
      });
      if (!customer) {
        throw new Error('Customer not found in tenant');
      }
    }

    return db.softwareBlacklistRule.create({
      data: {
        tenantId,
        customerId: data.customerId || null,
        name: data.name,
        pattern: data.pattern,
        category: data.category,
        severity: data.severity || Severity.HIGH,
        description: data.description,
        enabled: true,
        autoAlert: true,
      },
    });
  }

  static async deleteBlacklistRule(id: string, tenantId: string) {
    return db.softwareBlacklistRule.deleteMany({
      where: { id, tenantId },
    });
  }
}
