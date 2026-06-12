import { AuditEvent } from '../domain/audit-event';
import { ILoggerPort } from './ports/i-logger-port';

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

  constructor(private readonly logger?: ILoggerPort) {}

  publish(event: AuditEvent): void {
    for (const handler of this.handlers) {
      handler.handle(event).catch((err) => {
        this.logger?.error('AuditHandler failed', { error: (err as Error).message });
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
