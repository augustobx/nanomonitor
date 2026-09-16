import { PrismaClient } from '@prisma/client';
import { hashPassword } from './dist/lib/crypto.js';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@nanolabs.com.ar' } });
  if (!user) {
    console.log('User not found!');
    return;
  }
  const hash = await hashPassword('NanoLabs2026!MonitorAdmin');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash }
  });
  console.log('PASSWORD_RESET_SUCCESS for:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
