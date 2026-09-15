import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().default('postgresql://nanouser:nanopass2026@localhost:5432/nanomonitor?schema=public'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-for-dev-change-in-production-min-32-chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(7),
  AGENT_TIMESTAMP_DRIFT_SECS: z.coerce.number().default(300),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Configuration validation failed:', result.error.format());
    throw new Error('Invalid configuration');
  }
  return result.data;
}

export const config = loadConfig();
