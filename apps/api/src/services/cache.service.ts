import NodeCache from 'node-cache';
import { logger } from '../utils/logger';

export class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // Default 5 minutes
      checkperiod: 60, // Check for expired keys every 60s
      useClones: false, // Better performance
    });

    logger.info('Cache service initialized');
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.cache.get<T>(key);
    if (value !== undefined) {
      logger.debug(`Cache HIT: ${key}`);
    } else {
      logger.debug(`Cache MISS: ${key}`);
    }
    return value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    const result = this.cache.set(key, value, ttl || 300);
    if (result) {
      logger.debug(`Cache SET: ${key} (TTL: ${ttl || 300}s)`);
    }
    return result;
  }

  async del(key: string): Promise<number> {
    const result = this.cache.del(key);
    if (result > 0) {
      logger.debug(`Cache DELETE: ${key}`);
    }
    return result;
  }

  async flush(): Promise<void> {
    this.cache.flushAll();
    logger.info('Cache flushed');
  }

  // Pattern-based deletion for cache invalidation
  async delByPattern(pattern: string): Promise<void> {
    const keys = this.cache.keys();
    const matchingKeys = keys.filter((key) => key.includes(pattern));

    if (matchingKeys.length > 0) {
      this.cache.del(matchingKeys);
      logger.debug(
        `Cache DELETE by pattern: ${pattern} (${matchingKeys.length} keys)`
      );
    }
  }

  // Get cache statistics
  getStats() {
    return this.cache.getStats();
  }
}
