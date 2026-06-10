import { IRegistryPort } from '../../application/ports/i-registry-port';

export class InMemoryRegistryAdapter implements IRegistryPort {
  private registry: Map<string, Record<string, unknown>> = new Map();

  async register(id: string, metadata: Record<string, unknown>): Promise<void> {
    this.registry.set(id, metadata);
  }

  async deregister(id: string): Promise<void> {
    this.registry.delete(id);
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    return this.registry.get(id) || null;
  }

  async list(): Promise<Record<string, unknown>[]> {
    return Array.from(this.registry.values());
  }
}
