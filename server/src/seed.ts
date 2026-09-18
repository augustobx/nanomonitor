import { db } from './lib/db.js';
import { hashPassword } from './lib/crypto.js';
import { logger } from './lib/logger.js';

export async function seedDatabase() {
  const existingTenants = await db.tenant.count();
  if (existingTenants > 0) {
    logger.info('Database already initialized with tenant(s). Skipping initial seed.');
    return;
  }

  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (!initialPassword || initialPassword.length < 16) {
    throw new Error(
      'ADMIN_INITIAL_PASSWORD must be explicitly configured with at least 16 characters before initializing an empty production database.'
    );
  }

  logger.info('Initializing default NanoLabs tenant and SuperAdmin user...');
  const passwordHash = await hashPassword(initialPassword);

  const seeded = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: 'NanoLabs',
        slug: 'nanolabs',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
        maxDevices: 1000,
        contactEmail: 'admin@nanolabs.com.ar',
      },
    });

    const customer = await tx.customer.create({
      data: {
        tenantId: tenant.id,
        name: 'NanoLabs Infraestructura Interna',
        code: 'NANO',
        contactName: 'NanoLabs Admin',
        contactEmail: 'admin@nanolabs.com.ar',
        status: 'ACTIVE',
      },
    });

    const site = await tx.site.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        name: 'Oficina Central / Datacenter',
      },
    });

    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@nanolabs.com.ar',
        name: 'Augusto / NanoLabs Admin',
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    return { tenant, customer, site, admin };
  });

  logger.info(
    {
      tenantId: seeded.tenant.id,
      adminEmail: seeded.admin.email,
      customerId: seeded.customer.id,
      siteId: seeded.site.id,
    },
    '✅ Default seed completed successfully'
  );
}

// Allow direct CLI execution: `npx tsx src/seed.ts`
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .catch((err) => {
      logger.error({ err }, 'Seed failed');
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
