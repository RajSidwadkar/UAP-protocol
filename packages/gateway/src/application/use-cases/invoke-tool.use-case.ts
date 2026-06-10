import { ISandboxPort } from '../ports/i-sandbox-port';
import { UapEnvelope } from '../../domain/envelope';

export class InvokeToolUseCase {
  constructor(private readonly sandbox: ISandboxPort) {}

  async execute(envelope: UapEnvelope): Promise<unknown> {
    // In a real scenario, this would involve more validation and audit logging
    return this.sandbox.execute(envelope.method, envelope.params, []);
  }
}
