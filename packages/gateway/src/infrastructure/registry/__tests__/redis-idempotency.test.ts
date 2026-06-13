import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisRegistryAdapter } from '../redis-registry-adapter';
import { CapabilityCard } from '../../../domain/capability-card';
import type Redis from 'ioredis';

vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    ttl: vi.fn(),
    on: vi.fn(),
  }));
  return { default: RedisMock };
});

describe('RedisRegistryAdapter Idempotency', () => {
  let adapter: RedisRegistryAdapter;
  let mockRedis: Redis;

  const agentId = 'agent-1';
  const card: CapabilityCard = {
    issuer: agentId,
    version: '1.0.0',
    tools: [],
    scopes: [],
    issuedAt: 1000,
    expiresAt: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new RedisRegistryAdapter('redis://localhost');
    mockRedis = (adapter as any).client;
  });

  it('1. Duplicate registration preserves original registeredAt', async () => {
    const t1 = 1000;
    const t2 = 2000;
    
    const entry1 = {
      agentId,
      endpoint: 'http://locahost',
      card,
      registeredAt: t1,
      lastHeartbeat: t1,
    };

    // First call: resolve returns null (not registered)
    vi.mocked(mockRedis.get).mockResolvedValueOnce(null);
    
    vi.useFakeTimers();
    vi.setSystemTime(t1);
    await adapter.register(card, 'http://localhost');
    
    const firstSet = JSON.parse(vi.mocked(mockRedis.set).mock.calls[0]![1] as string);
    expect(firstSet.registeredAt).toBe(t1);

    // Second call: resolve returns entry1
    vi.mocked(mockRedis.get).mockResolvedValueOnce(JSON.stringify(entry1));
    vi.setSystemTime(t2);
    await adapter.register(card, 'http://localhost');
    
    const secondSet = JSON.parse(vi.mocked(mockRedis.set).mock.calls[1]![1] as string);
    expect(secondSet.registeredAt).toBe(t1); // Preserved
    expect(secondSet.lastHeartbeat).toBe(t2); // Updated
    
    vi.useRealTimers();
  });
});
