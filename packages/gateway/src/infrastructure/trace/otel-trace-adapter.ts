import { trace } from '@opentelemetry/api';
import { AuditEvent } from '../../domain/audit-event';
import { IAuditHandler } from '../../application/audit-event-bus';

export class OtelTraceAdapter implements IAuditHandler {
  handle(event: AuditEvent): Promise<void> {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('uap.audit.kind', event.kind);
      span.setAttribute('uap.audit.outcome', event.outcome);
      span.setAttribute('uap.caller_id', event.callerId);
      span.setAttribute('uap.resource', event.resource);
    }
    return Promise.resolve();
  }
}
