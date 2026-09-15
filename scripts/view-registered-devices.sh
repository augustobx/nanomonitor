#!/bin/bash
cd /opt/apps/nanomonitor
echo Qap.1029Qap.1029 | sudo -S docker compose exec -T nanomonitor-server node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const devices = await prisma.device.findMany({
    include: {
      inventories: { take: 1, orderBy: { collectedAt: 'desc' } },
      softwareInventories: { take: 1, orderBy: { collectedAt: 'desc' } }
    }
  });
  console.log(JSON.stringify(devices, null, 2));
}
main().finally(() => prisma.\$disconnect());
"
