import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteToolCallUseCase } from '../route-tool-call.use-case';
import { UapAgentNotFoundError, UapSandboxError } from '../../../domain/errors';
import { UapEnvelope } from '../../../domain/envelope';
import { IAuditPublisher } from '../../audit-event-bus';
import { IRegistryPort } from '../../ports/i-registry-port';

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
    
    // Reset global fetch mock
    vi.stubGlobal('fetch', vi.fn());
  });

  it('unknown agentId throws UapAgentNotFoundError', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue(null);
    await expect(useCase.execute(mockEnvelope, 'test-caller-id')).rejects.toThrow(UapAgentNotFoundError);
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

    const result = await useCase.execute(mockEnvelope, 'test-caller-id');
    
    expect(mockFetch).toHaveBeenCalledWith('http://agent-1.local/uap', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(mockEnvelope),
      signal: expect.any(AbortSignal),
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

    await expect(useCase.execute(mockEnvelope, 'test-caller-id')).rejects.toThrow(UapSandboxError);
  });

  it('fetch() hangs for >30s throws UapSandboxError containing "30s"', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-1',
      endpoint: 'http://agent-1.local/uap',
      card: { issuer: 'agent-1', version: '1.0.0', tools: [], scopes: [], issuedAt: 0, expiresAt: 0 },
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    const mockFetch = vi.fn().mockImplementation(() => {
      throw new DOMException('signal timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(useCase.execute(mockEnvelope, 'test-caller-id'))
      .rejects.toThrow(/timed out after 30s/);
  });

  it('fetch() throws network error throws UapSandboxError containing "unreachable"', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-1',
      endpoint: 'http://agent-1.local/uap',
      card: { issuer: 'agent-1', version: '1.0.0', tools: [], scopes: [], issuedAt: 0, expiresAt: 0 },
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(useCase.execute(mockEnvelope, 'test-caller-id'))
      .rejects.toThrow(/unreachable: fetch failed: ECONNREFUSED/);
  });
});
