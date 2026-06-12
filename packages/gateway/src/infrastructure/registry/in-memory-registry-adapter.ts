import { CapabilityCard } from '../../domain/capability-card';
import { IRegistryPort, RegistryEntry } from '../../application/ports/i-registry-port';
import { UapValidationError } from '../../domain/errors';

export class InMemoryRegistryAdapter implements IRegistryPort {
  private registry: Map<string, RegistryEntry> = new Map();

  async register(card: CapabilityCard, endpoint: string): Promise<void> {
    if (card.expiresAt <= Date.now()) {
      throw new UapValidationError('Card is expired');
    }

    const agentId = card.issuer;
    const now = Date.now();
    
    const entry: RegistryEntry = {
      agentId,
      endpoint,
      card,
      registeredAt: this.registry.get(agentId)?.registeredAt ?? now,
      lastHeartbeat: now,
    };

    this.registry.set(agentId, entry);
  }

  async resolve(agentId: string): Promise<RegistryEntry | null> {
    const entry = this.registry.get(agentId);
    if (!entry) {
      return null;
    }

    const updatedEntry: RegistryEntry = {
      ...entry,
      lastHeartbeat: Date.now(),
    };
    this.registry.set(agentId, updatedEntry);
    
    return updatedEntry;
  }

  async list(): Promise<RegistryEntry[]> {
    return Array.from(this.registry.values());
  }

  async deregister(agentId: string): Promise<void> {
    this.registry.delete(agentId);
  }
}
