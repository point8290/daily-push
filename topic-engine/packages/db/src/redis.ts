import Redis from 'ioredis';

// ─── Redis client (singleton) ─────────────────────────────────────────────────

let _redis: Redis | null = null;

/**
 * Returns the shared Redis client.
 * Reads REDIS_URL from the environment (set in .env).
 *
 * The client is created lazily on first access and reused across calls.
 * Call redis().quit() in process shutdown handlers.
 */
export function redis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

    _redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    _redis.on('error', (err: Error) => {
      console.error('[redis] Client error:', err.message);
    });
  }

  return _redis;
}

/**
 * Gracefully closes the Redis connection.
 * Call this in process.on('SIGTERM') / process.on('SIGINT') handlers.
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
