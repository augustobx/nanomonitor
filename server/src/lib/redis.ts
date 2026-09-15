import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

class InMemoryCache {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    const ttlMs = mode === 'EX' && duration ? duration * 1000 : 3600 * 1000;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }

  async setnx(key: string, value: string): Promise<number> {
    const existing = await this.get(key);
    if (existing !== null) return 0;
    this.store.set(key, { value, expiresAt: Date.now() + 3600 * 1000 });
    return 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

class CacheService {
  private redisClient: Redis | null = null;
  private memoryFallback = new InMemoryCache();
  private isRedisConnected = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.redisClient = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying and keep in-memory fallback
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      this.redisClient.on('connect', () => {
        this.isRedisConnected = true;
        logger.info('Connected to Redis');
      });

      this.redisClient.on('error', (err) => {
        if (this.isRedisConnected) {
          logger.warn({ err: err.message }, 'Redis error, falling back to in-memory cache');
        }
        this.isRedisConnected = false;
      });

      this.redisClient.connect().catch(() => {
        logger.warn('Redis connection failed on startup, using in-memory fallback cache');
      });
    } catch {
      logger.warn('Redis initialization failed, using in-memory fallback cache');
    }
  }

  async checkAndSetNonce(nonce: string, ttlSeconds = 600): Promise<boolean> {
    const key = `nonce:${nonce}`;
    if (this.isRedisConnected && this.redisClient) {
      try {
        // SET key 1 EX ttl NX returns 'OK' if key didn't exist, null otherwise
        const result = await this.redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (err) {
        logger.warn({ err }, 'Redis set error for nonce, fallback to memory');
      }
    }

    // Memory fallback
    const exists = await this.memoryFallback.get(key);
    if (exists !== null) {
      return false; // Nonce already seen
    }
    await this.memoryFallback.set(key, '1', 'EX', ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        return await this.redisClient.get(key);
      } catch {
        // fallback
      }
    }
    return this.memoryFallback.get(key);
  }

  async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        // fallback
      }
    }
    await this.memoryFallback.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch {
        // fallback
      }
    }
    await this.memoryFallback.del(key);
  }

  async disconnect() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        // ignore
      }
    }
  }
}

export const cacheService = new CacheService();
