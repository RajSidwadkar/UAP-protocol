export interface ToolManifest {
  readonly id: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly scopes: readonly string[];
}

export interface CapabilityCard {
  readonly issuer: string; // DID or UUID
  readonly version: string; // semver
  readonly tools: readonly ToolManifest[];
  readonly scopes: readonly string[];
  readonly issuedAt: number; // Unix ms
  readonly expiresAt: number; // Unix ms
  readonly signature?: string; // 'ed25519:<hex>'
}

export type PermissionScope =
  | 'tool:read'
  | 'tool:write'
  | 'network:egress'
  | 'fs:write'
  | 'net:bind'
  | 'sys:time'
  | 'task:submit'
  | 'task:read'
  | 'task:cancel'
  | 'admin:read'
  | 'admin:write';

export interface ICardSignerPort {
  sign(card: Omit<CapabilityCard, 'signature'>): Promise<CapabilityCard>;
  verify(card: CapabilityCard): Promise<boolean>;
}
