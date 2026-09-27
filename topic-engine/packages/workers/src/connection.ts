/**
 * BullMQ Redis connection config.
 *
 * BullMQ workers use BLPOP which blocks the connection, so they must NOT
 * share the ioredis singleton from packages/db. BullMQ manages its own
 * connections internally when given host/port options.
 */
export function getBullMQConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

  try {
    const parsed = new URL(url);
    return {
      host:     parsed.hostname || 'localhost',
      port:     parseInt(parsed.port || '6379', 10),
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      // rediss:// (e.g. Upstash) needs TLS
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      db:       parsed.pathname.length > 1
                  ? parseInt(parsed.pathname.slice(1), 10)
                  : undefined,
    };
  } catch {
    // Fallback if URL parsing fails
    return { host: 'localhost', port: 6379 };
  }
}
