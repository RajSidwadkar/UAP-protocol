import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegateTaskUseCase } from '../delegate-task.use-case';
import { IRegistryPort } from '../../ports/i-registry-port';
import { IAuditPublisher } from '../../audit-event-bus';
import { UapEnvelope } from '../../../domain/envelope';
import { UapSandboxError, UapAgentNotFoundError } from '../../../domain/errors';
import { CapabilityCard } from '../../../domain/capability-card';

describe('DelegateTaskUseCase', () => {
  let useCase: DelegateTaskUseCase;
  let mockRegistry: IRegistryPort;
  let mockAudit: IAuditPublisher;

  const mockEnvelope: UapEnvelope = {
    uap: {
      version: '1.0',
      type: 'agent_delegate',
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      auth: { token: 'valid-token', scope: ['task:submit'], card_sig: 'ed25519:sig' },
    },
    method: 'agent-2/delegate',
    schema_ref: 'uap:agent.delegate/v1',
    params: { agent_id: 'agent-2', input: { task: 'compute' } },
    ack: false,
  };

  beforeEach(() => {
    mockRegistry = {
      resolve: vi.fn(),
    } as unknown as IRegistryPort;
    mockAudit = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    useCase = new DelegateTaskUseCase(mockRegistry, mockAudit);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('1. Successful delegation publishes TASK_DELEGATED audit event', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-2',
      endpoint: 'http://agent-2.local',
      card: { issuer: 'agent-2' } as unknown as CapabilityCard,
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uap: mockEnvelope.uap, result: { status: 'ok' } }),
    }));

    const result = await useCase.execute(mockEnvelope, 'caller-1');

    expect(result.result).toEqual({ status: 'ok' });
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TASK_DELEGATED',
      outcome: 'success',
    }));
  });

  it('2. Agent not found throws UapAgentNotFoundError and publishes TASK_FAILED', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue(null);

    await expect(useCase.execute(mockEnvelope, 'caller-1')).rejects.toThrow(UapAgentNotFoundError);
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TASK_FAILED',
      outcome: 'failure',
    }));
  });

  it('3. Downstream HTTP failure throws UapSandboxError and publishes TASK_FAILED', async () => {
    vi.mocked(mockRegistry.resolve).mockResolvedValue({
      agentId: 'agent-2',
      endpoint: 'http://agent-2.local',
      card: { issuer: 'agent-2' } as unknown as CapabilityCard,
      registeredAt: 0,
      lastHeartbeat: 0,
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(useCase.execute(mockEnvelope, 'caller-1')).rejects.toThrow(UapSandboxError);
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TASK_FAILED',
      outcome: 'failure',
    }));
  });
});
