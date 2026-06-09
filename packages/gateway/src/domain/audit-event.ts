import { ulid } from 'ulid';

export type AuditEventKind =
  | 'TOOL_INVOKED' | 'TOOL_COMPLETED' | 'TOOL_FAILED'
  | 'TASK_DELEGATED' | 'TASK_COMPLETED' | 'TASK_FAILED'
  | 'AUTH_FAILURE' | 'CARD_TAMPERED' | 'SCHEMA_VIOLATION'
  | 'RPC_VALIDATION_FAILED' | 'SANDBOX_CREATED' | 'SANDBOX_FAILED'
  | 'AGENT_REGISTERED' | 'AGENT_DEREGISTERED' | 'AGENT_NOT_FOUND'
  | 'MCP_BRIDGE_CONNECTED' | 'MCP_TOOL_PROXIED' | 'MCP_BRIDGE_ERROR'
  | 'GATEWAY_STARTED' | 'MIGRATION_STARTED' | 'MIGRATION_COMPLETED' | 'MIGRATION_FAILED';

export class AuditEvent {
  public readonly id: string;
  public readonly timestamp: number;

  private constructor(
    public readonly kind: AuditEventKind,
    public readonly traceId: string,
    public readonly callerId: string,
    public readonly resource: string,
    public readonly outcome: 'success' | 'failure',
    public readonly metadata: Record<string, unknown>
  ) {
    this.id = ulid();
    this.timestamp = Date.now();
  }

  static create(params: Omit<AuditEvent, 'id' | 'timestamp' | 'toJSON'>): AuditEvent {
    return new AuditEvent(
      params.kind,
      params.traceId,
      params.callerId,
      params.resource,
      params.outcome,
      params.metadata
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      kind: this.kind,
      timestamp: this.timestamp,
      traceId: this.traceId,
      callerId: this.callerId,
      resource: this.resource,
      outcome: this.outcome,
      metadata: this.metadata,
    };
  }
}
