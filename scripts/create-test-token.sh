#!/bin/bash
cd /opt/apps/nanomonitor
echo Qap.1029Qap.1029 | sudo -S docker compose exec -T nanomonitor-server node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const tenant = await prisma.tenant.findFirst();
  const customer = await prisma.customer.findFirst({ where: { tenantId: tenant.id } });
  const crypto = require('crypto');
  const tokenStr = 'NL-TEST-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const token = await prisma.enrollmentToken.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      token: tokenStr,
      maxUses: 10,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
    }
  });
  console.log('TOKEN_GENERADO=' + token.token);
}
main().finally(() => prisma.\$disconnect());
"
