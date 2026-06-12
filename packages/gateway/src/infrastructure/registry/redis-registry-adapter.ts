import Redis from 'ioredis';
import { CapabilityCard } from '../../domain/capability-card';
import { IRegistryPort, RegistryEntry } from '../../application/ports/i-registry-port';
import { UapRegistryError, UapValidationError } from '../../domain/errors';

export class RedisRegistryAdapter implements IRegistryPort {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
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
      await this.redis.set(
        `registry:${agentId}`,
        JSON.stringify(entry),
        'EX',
        ttlSeconds
      );
    } catch (err) {
      throw new UapRegistryError(`Registry write failed: ${(err as Error).message}`);
    }
  }

  async resolve(agentId: string): Promise<RegistryEntry | null> {
    let data: string | null;
    try {
      data = await this.redis.get(`registry:${agentId}`);
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
      const ttlSeconds = await this.redis.ttl(`registry:${agentId}`);
      if (ttlSeconds > 0) {
        await this.redis.set(
          `registry:${agentId}`,
          JSON.stringify(updatedEntry),
          'EX',
          ttlSeconds
        );
      }
    } catch (err) {
      throw new UapRegistryError(`Registry update failed: ${(err as Error).message}`);
    }

    return updatedEntry;
  }

  async list(): Promise<RegistryEntry[]> {
    let keys: string[];
    try {
      keys = await this.redis.keys('registry:*');
    } catch (err) {
      throw new UapRegistryError(`Registry list keys failed: ${(err as Error).message}`);
    }

    if (keys.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
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
      await this.redis.del(`registry:${agentId}`);
    } catch (err) {
      throw new UapRegistryError(`Registry delete failed: ${(err as Error).message}`);
    }
  }
}

