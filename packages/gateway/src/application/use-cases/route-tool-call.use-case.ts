import { IRegistryPort } from '../ports/i-registry-port';
import { IAuditPublisher } from '../audit-event-bus';
import { UapEnvelope, UapResponse } from '../../domain/envelope';
import { UapAgentNotFoundError, UapSandboxError } from '../../domain/errors';
import { AuditEvent } from '../../domain/audit-event';

export class RouteToolCallUseCase {
  constructor(
    private readonly registry: IRegistryPort,
    private readonly audit: IAuditPublisher
  ) {}

  async execute(envelope: UapEnvelope, callerId: string): Promise<UapResponse> {
    const parts = envelope.method.split('/');
    const agentId = parts[0];
    const toolId = parts[1];

    if (!agentId) {
      throw new Error('Invalid envelope method: missing agentId');
    }

    const entry = await this.registry.resolve(agentId);

    if (!entry) {
      throw new UapAgentNotFoundError(agentId);
    }

    try {
      const response = await fetch(entry.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new UapSandboxError(`Agent returned ${response.status}: ${JSON.stringify(body)}`);
      }

      const result = body as UapResponse;

      this.audit.publish(AuditEvent.create({
        kind: 'TOOL_INVOKED',
        traceId: envelope.uap.trace.traceparent,
        callerId: callerId, // Simplified callerId from token
        resource: agentId,
        outcome: 'success',
        metadata: {
          method: envelope.method,
          toolId: toolId || 'unknown',
        },
      }));

      return result;
    } catch (err) {
      if (err instanceof UapSandboxError || err instanceof UapAgentNotFoundError) {
        throw err;
      }
      throw new UapSandboxError(err instanceof Error ? err.message : String(err));
    }
  }
}
