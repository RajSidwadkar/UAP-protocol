import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContainer } from '../../composition-root';
import { InMemoryRegistryAdapter } from '../in-memory-registry-adapter';
import { RedisRegistryAdapter } from '../redis-registry-adapter';
import Redis from 'ioredis';
import * as fs from 'fs';

const dummyKey = '0'.repeat(64); // 32 bytes hex

vi.mock('pino', () => {
  const pino = vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  });
  (pino as any).destination = vi.fn().mockReturnValue({});
  return {
    default: pino,
  };
});

vi.mock('ioredis', () => {
  const mockInstance = {
    on: vi.fn(),
    once: vi.fn(),
    status: 'connecting',
  };
  const MockRedis = vi.fn().mockReturnValue(mockInstance);
  return {
    default: MockRedis,
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

describe('Redis Registry Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
    vi.useFakeTimers();
    
    // Mock fs to avoid private key error
    vi.mocked(fs.readFileSync).mockReturnValue(dummyKey);
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('1. REDIS_URL absent → returns InMemoryRegistryAdapter', async () => {
    const container = await buildContainer();
    expect(container.registry).toBeInstanceOf(InMemoryRegistryAdapter);
  });

  it('2. REDIS_URL present, Redis responds "ready" → returns RedisRegistryAdapter', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const containerPromise = buildContainer();
    
    // Get the mock instance
    const mockRedis = vi.mocked(Redis).mock.results[0]?.value;
    
    // Simulate 'ready' event
    const readyCallback = mockRedis.once.mock.calls.find((call: any) => call[0] === 'ready')?.[1];
    if (readyCallback) readyCallback();
    
    const container = await containerPromise;
    expect(container.registry).toBeInstanceOf(RedisRegistryAdapter);
  });

  it('3. REDIS_URL present, Redis emits "error" before timeout → returns InMemoryRegistryAdapter', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const containerPromise = buildContainer();
    
    const mockRedis = vi.mocked(Redis).mock.results[0]?.value;
    
    // Simulate 'error' event
    const errorCallback = mockRedis.once.mock.calls.find((call: any) => call[0] === 'error')?.[1];
    if (errorCallback) errorCallback(new Error('Connection failed'));
    
    const container = await containerPromise;
    expect(container.registry).toBeInstanceOf(InMemoryRegistryAdapter);
  });

  it('4. REDIS_URL present, Redis times out (3s) → returns InMemoryRegistryAdapter', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const containerPromise = buildContainer();
    
    // Advance timers by 3 seconds
    await vi.advanceTimersByTimeAsync(3000);
    
    const container = await containerPromise;
    expect(container.registry).toBeInstanceOf(InMemoryRegistryAdapter);
  });

  it('5. Redis .on("error") handler → error does NOT throw/crash Node process', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const adapter = new RedisRegistryAdapter(process.env.REDIS_URL);
    const mockRedis = vi.mocked(Redis).mock.results[0]?.value;
    
    const errorCallback = mockRedis.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
    
    expect(errorCallback).toBeDefined();
    expect(() => errorCallback(new Error('Async error'))).not.toThrow();
  });
});
