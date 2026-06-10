import { CapabilityCard } from '../../domain/capability-card';

export interface RegistryEntry {
  agentId: string;
  endpoint: string;
  card: CapabilityCard;
  registeredAt: number;
  lastHeartbeat: number;
}

export interface IRegistryPort {
  register(card: CapabilityCard, endpoint: string): Promise<void>;
  resolve(agentId: string): Promise<RegistryEntry | null>;
  list(): Promise<RegistryEntry[]>;
  deregister(agentId: string): Promise<void>;
}
