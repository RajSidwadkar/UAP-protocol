import { AuditEvent } from '../domain/audit-event';

export interface IAuditHandler {
  handle(event: AuditEvent): Promise<void>;
}

export interface IAuditPublisher {
  publish(event: AuditEvent): void;
  subscribe(handler: IAuditHandler): void;
  unsubscribe(handler: IAuditHandler): void;
}

export class AuditEventBus implements IAuditPublisher {
  private handlers: Set<IAuditHandler> = new Set();

  publish(event: AuditEvent): void {
    for (const handler of this.handlers) {
      handler.handle(event).catch((err) => {
        console.error('AuditHandler failed', err);
      });
    }
  }

  subscribe(handler: IAuditHandler): void {
    this.handlers.add(handler);
  }

  unsubscribe(handler: IAuditHandler): void {
    this.handlers.delete(handler);
  }
}
