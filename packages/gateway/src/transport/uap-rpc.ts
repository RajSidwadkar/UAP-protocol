import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { UapEnvelope } from '../domain/envelope';
import { UapValidationError, UapUnknownSchemaRefError } from '../domain/errors';

export type BatchSemantics = 'serial' | 'parallel' | 'transactional';

export interface IBatchRequest {
  semantics: BatchSemantics;
  requests: UapEnvelope[];
}

export class BuiltinSchemaRegistry {
  private static readonly schemas: Record<string, object> = {
    'uap:tool.invoke/v1': {
      type: 'object',
      required: ['tool_id', 'input'],
      properties: {
        tool_id: { type: 'string' },
        input: { type: 'object' },
      },
    },
    'uap:agent.delegate/v1': {
      type: 'object',
      required: ['agent_id', 'input'],
      properties: {
        agent_id: { type: 'string' },
        input: { type: 'object' },
      },
    },
    'uap:stream.open/v1': {
      type: 'object',
      required: ['channel_id'],
      properties: {
        channel_id: { type: 'string' },
      },
    },
  };

  static get(ref: string): object | undefined {
    return this.schemas[ref];
  }
}

export class UapRpcTransport {
  private readonly ajv: Ajv;
  private readonly schemaCache = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(this.ajv);
  }

  validate(envelope: UapEnvelope): void {
    let validator = this.schemaCache.get(envelope.schema_ref);

    if (!validator) {
      const schema = BuiltinSchemaRegistry.get(envelope.schema_ref);
      if (!schema) {
        throw new UapUnknownSchemaRefError(envelope.schema_ref);
      }
      validator = this.ajv.compile(schema);
      this.schemaCache.set(envelope.schema_ref, validator);
    }

    const valid = validator(envelope.params);
    if (!valid) {
      const errorText = this.ajv.errorsText(validator.errors);
      console.warn({
        kind: 'RPC_VALIDATION_FAILED',
        schema_ref: envelope.schema_ref,
        errors: validator.errors,
      });
      throw new UapValidationError(errorText);
    }
  }

  async executeBatch(batch: IBatchRequest): Promise<unknown[]> {
    switch (batch.semantics) {
      case 'parallel':
        return Promise.all(batch.requests.map(r => this.executeSingle(r)));
      case 'serial': {
        const results: unknown[] = [];
        for (const request of batch.requests) {
          results.push(await this.executeSingle(request));
        }
        return results;
      }
      case 'transactional': {
        // Collect results, if any error → throw (no rollback in v1)
        const results: unknown[] = [];
        for (const request of batch.requests) {
          results.push(await this.executeSingle(request));
        }
        return results;
      }
      default:
        throw new UapValidationError(`Unsupported batch semantics: ${(batch as any).semantics}`);
    }
  }

  private async executeSingle(envelope: UapEnvelope): Promise<unknown> {
    this.validate(envelope);
    return Promise.resolve(envelope.params);
  }
}
