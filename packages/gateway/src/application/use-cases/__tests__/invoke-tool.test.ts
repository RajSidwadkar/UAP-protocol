import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvokeToolUseCase } from '../invoke-tool.use-case';
import { ISandboxPort } from '../../ports/i-sandbox-port';
import { IAuditPublisher } from '../../audit-event-bus';
import { UapEnvelope } from '../../../domain/envelope';
import { UapSandboxError, UapError } from '../../../domain/errors';

describe('InvokeToolUseCase', () => {
  let useCase: InvokeToolUseCase;
  let mockSandbox: ISandboxPort;
  let mockAudit: IAuditPublisher;

  const mockEnvelope: UapEnvelope = {
    uap: {
      version: '1.0',
      type: 'tool_call',
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      auth: { token: 'valid-token', scope: ['tool:read'], card_sig: 'ed25519:sig' },
    },
    method: 'agent/weather',
    schema_ref: 'uap:tool.invoke/v1',
    params: { tool_id: 'weather', input: { city: 'London' } },
    ack: false,
  };

  beforeEach(() => {
    mockSandbox = {
      execute: vi.fn(),
    } as unknown as ISandboxPort;
    mockAudit = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    useCase = new InvokeToolUseCase(mockSandbox, mockAudit);
  });

  it('1. Successful tool invocation publishes TOOL_COMPLETED audit event', async () => {
    vi.mocked(mockSandbox.execute).mockResolvedValue({
      stdout: 'sunny',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
    });

    const result = await useCase.execute(mockEnvelope, 'caller-1');

    expect(result).toEqual({
      stdout: 'sunny',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
    });
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TOOL_INVOKED',
      outcome: 'success',
    }));
  });

  it('2. Sandbox failure (UapSandboxError) publishes TOOL_FAILED event and rethrows', async () => {
    const error = new UapSandboxError('Docker error');
    vi.mocked(mockSandbox.execute).mockRejectedValue(error);

    await expect(useCase.execute(mockEnvelope, 'caller-1')).rejects.toThrow(UapSandboxError);
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TOOL_FAILED',
      outcome: 'failure',
    }));
  });

  it('3. Unknown error is wrapped in UapSandboxError and published as TOOL_FAILED', async () => {
    vi.mocked(mockSandbox.execute).mockRejectedValue(new Error('Unexpected'));

    try {
      await useCase.execute(mockEnvelope, 'caller-1');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const uapErr = err as UapError;
      expect(uapErr).toBeInstanceOf(UapError);
      expect(uapErr.code).toBe('UAP_SANDBOX_ERROR');
      expect(uapErr.message).toBe('Unexpected');
    }
    
    expect(mockAudit.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'TOOL_FAILED',
      outcome: 'failure',
    }));
  });
});
