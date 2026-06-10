import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryRegistryAdapter } from '../../../infrastructure/registry/in-memory-registry-adapter';
import { RouteToolCallUseCase } from '../../use-cases/route-tool-call.use-case';
import { CapabilityCard } from '../../../domain/capability-card';
import { UapAgentNotFoundError, UapSandboxError } from '../../../domain/errors';
import { UapEnvelope } from '../../../domain/envelope';
import { IAuditPublisher } from '../../audit-event-bus';
import { IRegistryPort } from '../../ports/i-registry-port';

describe('InMemoryRegistryAdapter', () => {
  let adapter: InMemoryRegistryAdapter;
  const mockCard: CapabilityCard = {
    issuer: 'agent-1',
    version: '1.0.0',
    tools: [],
    scopes: [],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10000,
  };

  beforeEach(() => {
    adapter = new InMemoryRegistryAdapter();
  });

  it('register + resolve returns RegistryEntry', async () => {
    await adapter.register(mockCard, 'http://agent-1.local');
    const entry = await adapter.resolve('agent-1');
    expect(entry).not.toBeNull();
    expect(entry?.agentId).toBe('agent-1');
    expect(entry?.endpoint).toBe('http://agent-1.local');
  });

  it('register with expired card throws error', async () => {
    const expiredCard = { ...mockCard, expiresAt: Date.now() - 1000 };
    await expect(adapter.register(expiredCard, 'http://agent-1.local'))
      .rejects.toThrow('Card is expired');
  });

  it('resolve unknown agentId returns null', async () => {
    const entry = await adapter.resolve('unknown');
    expect(entry).toBeNull();
  });

  it('deregister makes resolve return null', async () => {
    await adapter.register(mockCard, 'http://agent-1.local');
    await adapter.deregister('agent-1');
    const entry = await adapter.resolve('agent-1');
    expect(entry).toBeNull();
  });

  it('resolve updates lastHeartbeat', async () => {
    await adapter.register(mockCard, 'http://agent-1.local');
    const entry1 = await adapter.resolve('agent-1');
    const hb1 = entry1?.lastHeartbeat || 0;
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const entry2 = await adapter.resolve('agent-1');
    const hb2 = entry2?.lastHeartbeat || 0;
    
    expect(hb2).toBeGreaterThan(hb1);
  });
});

describe('RouteToolCallUseCase', () => {
  let useCase: RouteToolCallUseCase;
  let mockRegistry: IRegistryPort;
  let mockAudit: IAuditPublisher;

  const mockEnvelope: UapEnvelope = {
    uap: {
      version: '1.0',
      type: 'tool_call',
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      auth: { token: 'valid-token', scope: ['tool:read'], card_sig: 'ed25519:sig' },
    },
    method: 'agent-1/get_info',
    schema_ref: 'uap:schema',
    params: {},
    ack: false,
  };

  beforeEach(() => {
    mockRegistry = {
      resolve: vi.fn(),
      register: vi.fn(),
      deregister: vi.fn(),
      list: vi.fn(),
    } as unknown as IRegistryPort;
    mockAudit = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    useCase = new RouteToolCallUseCase(mockRegistry, mockAudit);
    
    // Reset global fetch mock if any
    vi.stubGlobal('fetch', vi.fn());
  });

  it('unknown agentId throws UapAgentNotFoundError', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue(null);
    await expect(useCase.execute(mockEnvelope)).rejects.toThrow(UapAgentNotFoundError);
  });

  it('valid agent calls fetch with correct endpoint URL', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-1',
      endpoint: 'http://agent-1.local/uap',
      card: { issuer: 'agent-1', version: '1.0.0', tools: [], scopes: [], issuedAt: 0, expiresAt: 0 },
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uap: mockEnvelope.uap, result: { ok: true } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await useCase.execute(mockEnvelope);
    
    expect(mockFetch).toHaveBeenCalledWith('http://agent-1.local/uap', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(mockEnvelope),
    }));
    expect(result.result).toEqual({ ok: true });
    expect(mockAudit.publish).toHaveBeenCalled();
  });

  it('fetch returns 500 throws UapSandboxError', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-1',
      endpoint: 'http://agent-1.local/uap',
      card: { issuer: 'agent-1', version: '1.0.0', tools: [], scopes: [], issuedAt: 0, expiresAt: 0 },
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(useCase.execute(mockEnvelope)).rejects.toThrow(UapSandboxError);
  });
});
