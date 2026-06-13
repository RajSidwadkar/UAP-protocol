import { ISandboxPort } from '../ports/i-sandbox-port';
import { UapEnvelope } from '../../domain/envelope';
import { IAuditPublisher } from '../audit-event-bus';
import { AuditEvent } from '../../domain/audit-event';
import { UapError, UapSandboxError } from '../../domain/errors';

export class InvokeToolUseCase {
  constructor(
    private readonly sandbox: ISandboxPort,
    private readonly audit: IAuditPublisher
  ) {}

  async execute(envelope: UapEnvelope, callerId: string): Promise<unknown> {
    const parts = envelope.method.split('/');
    const toolId = parts[1] || envelope.params.tool_id as string || 'unknown';

    try {
      const result = await this.sandbox.execute(envelope.method, envelope.params, envelope.uap.auth.scope);
      
      this.audit.publish(AuditEvent.create({
        kind: 'TOOL_INVOKED',
        traceId: envelope.uap.trace.traceparent,
        callerId: callerId, // Simplified
        resource: envelope.method,
        outcome: 'success',
        metadata: {
          toolId,
          params: envelope.params,
        },
      }));

      return result;
    } catch (err) {
      this.audit.publish(AuditEvent.create({
        kind: 'TOOL_FAILED',
        traceId: envelope.uap.trace.traceparent,
        callerId: callerId,
        resource: envelope.method,
        outcome: 'failure',
        metadata: {
          toolId,
          error: err instanceof Error ? err.message : String(err),
        },
      }));

      if (err instanceof UapError) {
        throw err;
      }
      throw new UapSandboxError(err instanceof Error ? err.message : String(err));
    }
  }
}
