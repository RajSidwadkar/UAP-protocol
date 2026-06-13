import Redis from 'ioredis';
import { CapabilityCard } from '../../domain/capability-card';
import { IRegistryPort, RegistryEntry } from '../../application/ports/i-registry-port';
import { UapRegistryError, UapValidationError } from '../../domain/errors';

class TtlCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}

export class RedisRegistryAdapter implements IRegistryPort {
  private readonly client: Redis;
  private readonly cache: TtlCache<RegistryEntry>;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
    this.cache = new TtlCache(5_000); // 5 second TTL

    this.client.on('error', (err) => {
      console.error({ kind: 'REDIS_CONNECTION_ERROR', message: err.message });
    });
  }

  isHealthy(): boolean {
    return this.client.status === 'ready';
  }

  async register(card: CapabilityCard, endpoint: string): Promise<void> {
    if (card.expiresAt <= Date.now()) {
      throw new UapValidationError('Card is expired');
    }

    const agentId = card.issuer;
    const ttlSeconds = Math.floor((card.expiresAt - Date.now()) / 1000);

    if (ttlSeconds <= 0) {
      throw new UapValidationError('Card is expired or has very short TTL');
    }

    const now = Date.now();
    
    // Check if already registered to preserve registeredAt
    const existing = await this.resolve(agentId);
    
    const entry: RegistryEntry = {
      agentId,
      endpoint,
      card,
      registeredAt: existing?.registeredAt ?? now,
      lastHeartbeat: now,
    };

    try {
      await this.client.set(
        `registry:${agentId}`,
        JSON.stringify(entry),
        'EX',
        ttlSeconds
      );
      this.cache.set(agentId, entry);
    } catch (err) {
      throw new UapRegistryError(`Registry write failed: ${(err as Error).message}`);
    }
  }

  async resolve(agentId: string): Promise<RegistryEntry | null> {
    const cached = this.cache.get(agentId);
    if (cached) {
      return cached;
    }

    let data: string | null;
    try {
      data = await this.client.get(`registry:${agentId}`);
    } catch (err) {
      throw new UapRegistryError(`Registry read failed: ${(err as Error).message}`);
    }

    if (!data) {
      return null;
    }

    const entry = JSON.parse(data) as RegistryEntry;
    
    // Update heartbeat
    const updatedEntry: RegistryEntry = {
      ...entry,
      lastHeartbeat: Date.now(),
    };
    
    try {
      const ttlSeconds = await this.client.ttl(`registry:${agentId}`);
      if (ttlSeconds > 0) {
        await this.client.set(
          `registry:${agentId}`,
          JSON.stringify(updatedEntry),
          'EX',
          ttlSeconds
        );
      }
      this.cache.set(agentId, updatedEntry);
    } catch (err) {
      throw new UapRegistryError(`Registry update failed: ${(err as Error).message}`);
    }

    return updatedEntry;
  }

  async list(): Promise<RegistryEntry[]> {
    let keys: string[];
    try {
      keys = await this.client.keys('registry:*');
    } catch (err) {
      throw new UapRegistryError(`Registry list keys failed: ${(err as Error).message}`);
    }

    if (keys.length === 0) {
      return [];
    }

    const pipeline = this.client.pipeline();
    keys.forEach(key => pipeline.get(key));
    
    let results: [Error | null, unknown][] | null;
    try {
      results = await pipeline.exec();
    } catch (err) {
      throw new UapRegistryError(`Registry pipeline exec failed: ${(err as Error).message}`);
    }

    return (results || [])
      .map(([err, data]) => {
        if (err || !data) return null;
        return JSON.parse(data as string) as RegistryEntry;
      })
      .filter((e): e is RegistryEntry => e !== null);
  }

  async deregister(agentId: string): Promise<void> {
    try {
      await this.client.del(`registry:${agentId}`);
      this.cache.delete(agentId);
    } catch (err) {
      throw new UapRegistryError(`Registry delete failed: ${(err as Error).message}`);
    }
  }
}

