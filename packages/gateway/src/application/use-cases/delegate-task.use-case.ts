import { IRegistryPort } from '../ports/i-registry-port';
import { UapEnvelope } from '../../domain/envelope';

export class DelegateTaskUseCase {
  constructor(private readonly registry: IRegistryPort) {}

  async execute(envelope: UapEnvelope, _callerId: string): Promise<unknown> {
    // Minimal implementation for delegation
    return { status: 'delegated', id: envelope.uap.id };
  }
}
