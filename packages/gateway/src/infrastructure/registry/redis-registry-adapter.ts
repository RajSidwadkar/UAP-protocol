import Redis from 'ioredis';
import { CapabilityCard } from '../../domain/capability-card';
import { IRegistryPort, RegistryEntry } from '../../application/ports/i-registry-port';

export class RedisRegistryAdapter implements IRegistryPort {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async register(card: CapabilityCard, endpoint: string): Promise<void> {
    if (card.expiresAt <= Date.now()) {
      throw new Error('Card is expired');
    }

    const agentId = card.issuer;
    const ttlSeconds = Math.floor((card.expiresAt - Date.now()) / 1000);

    if (ttlSeconds <= 0) {
      throw new Error('Card is expired or has very short TTL');
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

    await this.redis.set(
      `registry:${agentId}`,
      JSON.stringify(entry),
      'EX',
      ttlSeconds
    );
  }

  async resolve(agentId: string): Promise<RegistryEntry | null> {
    const data = await this.redis.get(`registry:${agentId}`);
    if (!data) {
      return null;
    }

    const entry = JSON.parse(data) as RegistryEntry;
    
    // Update heartbeat
    const updatedEntry: RegistryEntry = {
      ...entry,
      lastHeartbeat: Date.now(),
    };
    
    const ttlSeconds = await this.redis.ttl(`registry:${agentId}`);
    if (ttlSeconds > 0) {
      await this.redis.set(
        `registry:${agentId}`,
        JSON.stringify(updatedEntry),
        'EX',
        ttlSeconds
      );
    }

    return updatedEntry;
  }

  async list(): Promise<RegistryEntry[]> {
    const keys = await this.redis.keys('registry:*');
    if (keys.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();

    return (results || [])
      .map(([err, data]) => {
        if (err || !data) return null;
        return JSON.parse(data as string) as RegistryEntry;
      })
      .filter((e): e is RegistryEntry => e !== null);
  }

  async deregister(agentId: string): Promise<void> {
    await this.redis.del(`registry:${agentId}`);
  }
}
