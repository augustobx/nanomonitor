import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

// Global BigInt JSON serialization polyfill for Prisma BigInt fields
if (!('toJSON' in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const db =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = db;
}

// Log slow queries in development
if (process.env.NODE_ENV === 'development') {
  // @ts-expect-error prisma query event
  db.$on('query', (e: { query: string; duration: number }) => {
    if (e.duration > 100) {
      logger.warn({ query: e.query, durationMs: e.duration }, 'Slow database query detected');
    }
  });
}
