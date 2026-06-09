import pino from 'pino';
import { AuditEvent } from '../../domain/audit-event';
import { IAuditHandler } from '../../application/audit-event-bus';

export class PinoAuditAdapter implements IAuditHandler {
  private readonly log: pino.Logger;

  constructor(logDir: string) {
    this.log = pino(
      { level: 'info' },
      pino.destination({
        dest: `${logDir}/audit.ndjson`,
        append: true,
        sync: false,
      })
    );
  }

  handle(event: AuditEvent): Promise<void> {
    this.log.info(event.toJSON());
    return Promise.resolve();
  }
}
