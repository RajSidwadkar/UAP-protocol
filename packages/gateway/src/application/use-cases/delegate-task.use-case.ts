import { IRegistryPort } from '../ports/i-registry-port';
import { UapEnvelope, UapResponse } from '../../domain/envelope';
import { IAuditPublisher } from '../audit-event-bus';
import { AuditEvent } from '../../domain/audit-event';
import { UapError, UapSandboxError, UapAgentNotFoundError, UapValidationError } from '../../domain/errors';

export class DelegateTaskUseCase {
  constructor(
    private readonly registry: IRegistryPort,
    private readonly audit: IAuditPublisher
  ) {}

  async execute(envelope: UapEnvelope, callerId: string): Promise<UapResponse> {
    const parts = envelope.method.split('/');
    const agentId = parts[0] || envelope.params.agent_id as string;

    if (!agentId) {
      throw new UapValidationError('Invalid envelope method or params: missing agentId');
    }

    try {
      const entry = await this.registry.resolve(agentId);
      if (!entry) {
        throw new UapAgentNotFoundError(agentId);
      }

      const response = await fetch(entry.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(30_000),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new UapSandboxError(`Agent returned ${response.status}: ${JSON.stringify(body)}`);
      }

      this.audit.publish(AuditEvent.create({
        kind: 'TASK_DELEGATED',
        traceId: envelope.uap.trace.traceparent,
        callerId: callerId,
        resource: agentId,
        outcome: 'success',
        metadata: {
          method: envelope.method,
          targetAgentId: agentId,
        },
      }));

      return body as UapResponse;
    } catch (err) {
      this.audit.publish(AuditEvent.create({
        kind: 'TASK_FAILED',
        traceId: envelope.uap.trace.traceparent,
        callerId: callerId,
        resource: envelope.method,
        outcome: 'failure',
        metadata: {
          error: err instanceof Error ? err.message : String(err),
        },
      }));

      if (err instanceof UapError) {
        throw err;
      }
      if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new UapSandboxError(`Agent ${agentId} timed out after 30s`);
      }
      throw new UapSandboxError(err instanceof Error ? err.message : String(err));
    }
  }
}
