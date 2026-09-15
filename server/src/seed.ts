import { db } from './lib/db.js';
import { hashPassword } from './lib/crypto.js';
import { logger } from './lib/logger.js';

export async function seedDatabase() {
  const existingTenants = await db.tenant.count();
  if (existingTenants > 0) {
    logger.info('Database already initialized with tenant(s). Skipping initial seed.');
    return;
  }

  logger.info('Initializing default NanoLabs tenant and SuperAdmin user...');

  // 1. Create Default Tenant
  const tenant = await db.tenant.create({
    data: {
      name: 'NanoLabs',
      slug: 'nanolabs',
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
      maxDevices: 1000,
      contactEmail: 'admin@nanolabs.com.ar',
    },
  });

  // 2. Create Default Customer
  const customer = await db.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'NanoLabs Infraestructura Interna',
      code: 'NANO',
      contactName: 'NanoLabs Admin',
      contactEmail: 'admin@nanolabs.com.ar',
      status: 'ACTIVE',
    },
  });

  // 3. Create Default Site
  const site = await db.site.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      name: 'Oficina Central / Datacenter',
    },
  });

  // 4. Create SuperAdmin User
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'NanoLabs2026!Admin';
  const passwordHash = await hashPassword(initialPassword);

  const admin = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@nanolabs.com.ar',
      name: 'Augusto / NanoLabs Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  logger.info(
    {
      tenantId: tenant.id,
      adminEmail: admin.email,
      customerId: customer.id,
      siteId: site.id,
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
