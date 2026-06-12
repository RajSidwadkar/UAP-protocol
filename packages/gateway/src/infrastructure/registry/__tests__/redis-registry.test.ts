import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisRegistryAdapter } from '../redis-registry-adapter';
import { CapabilityCard } from '../../../domain/capability-card';
import type Redis from 'ioredis';

// Mock ioredis
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    pipeline: vi.fn().mockReturnValue({
      get: vi.fn(),
      exec: vi.fn(),
    }),
    ttl: vi.fn(),
  }));
  return {
    default: RedisMock,
  };
});

describe('RedisRegistryAdapter', () => {
  let adapter: RedisRegistryAdapter;
  let mockRedis: Redis;

  const validCard: CapabilityCard = {
    issuer: 'agent-1',
    version: '1.0.0',
    tools: [],
    scopes: [],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new RedisRegistryAdapter('redis://localhost:6379');
    mockRedis = (adapter as unknown as { redis: Redis }).redis;
    // mock resolve to return null by default to avoid issues in register
    vi.mocked(mockRedis.get).mockResolvedValue(null);
  });

  it('throws UapRegistryError when Redis set fails', async () => {
    vi.mocked(mockRedis.set).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(adapter.register(validCard, 'http://agent:3001')).rejects.toMatchObject({
      code: 'UAP_REGISTRY_ERROR',
    });
  });

  it('throws UapRegistryError when Redis get fails', async () => {
    vi.mocked(mockRedis.get).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(adapter.resolve('agent-1')).rejects.toMatchObject({
      code: 'UAP_REGISTRY_ERROR',
    });
  });
});
