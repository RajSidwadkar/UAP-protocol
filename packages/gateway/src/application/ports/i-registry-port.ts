export interface IRegistryPort {
  register(id: string, metadata: Record<string, unknown>): Promise<void>;
  deregister(id: string): Promise<void>;
  get(id: string): Promise<Record<string, unknown> | null>;
  list(): Promise<Record<string, unknown>[]>;
}
