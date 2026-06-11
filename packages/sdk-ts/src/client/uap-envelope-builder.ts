import { ulid } from 'ulid';
import * as crypto from 'node:crypto';
import { UapEnvelope } from '../domain/envelope.js';

export class UapEnvelopeBuilder {
  static toolCall(params: {
    toolId: string;
    input: unknown;
    token: string;
    scope: string[];
    cardSig: string;
  }): UapEnvelope {
    const traceId = crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${spanId}-01`;

    return {
      uap: {
        version: '1.0',
        type: 'tool_call',
        id: ulid(),
        trace: {
          traceparent,
        },
        auth: {
          token: params.token,
          scope: params.scope,
          card_sig: params.cardSig,
        },
      },
      method: 'tools/invoke',
      schema_ref: 'uap:tool.invoke/v1',
      params: {
        tool_id: params.toolId,
        input: params.input as Record<string, unknown>,
      },
      ack: true,
    };
  }

  static agentDelegate(params: {
    agentId: string;
    input: unknown;
    token: string;
    scope: string[];
    cardSig: string;
  }): UapEnvelope {
    const traceId = crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${spanId}-01`;

    return {
      uap: {
        version: '1.0',
        type: 'agent_delegate',
        id: ulid(),
        trace: {
          traceparent,
        },
        auth: {
          token: params.token,
          scope: params.scope,
          card_sig: params.cardSig,
        },
      },
      method: `${params.agentId}/task.submit`,
      schema_ref: 'uap:agent.delegate/v1',
      params: {
        agent_id: params.agentId,
        input: params.input as Record<string, unknown>,
      },
      ack: true,
    };
  }
}
