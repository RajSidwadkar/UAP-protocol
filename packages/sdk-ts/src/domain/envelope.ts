import { z } from 'zod';

export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const TraceparentSchema = z.string().regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/);

export const UapHeaderSchema = z.object({
  version: z.literal('1.0'),
  type: z.enum(['tool_call', 'agent_delegate', 'stream', 'response']),
  id: UlidSchema,
  trace: z.object({
    traceparent: TraceparentSchema,
    tracestate: z.string().optional(),
  }),
  auth: z.object({
    token: z.string().min(1),
    scope: z.array(z.string()).min(1),
    card_sig: z.string().regex(/^ed25519:/).optional(),
  }),
});

export const UapEnvelopeSchema = z.object({
  uap: UapHeaderSchema,
  method: z.string().regex(/^[a-zA-Z0-9_\-.]+\/[a-zA-Z0-9_\-.]+$/),
  schema_ref: z.string().startsWith('uap:'),
  params: z.record(z.string(), z.unknown()),
  ack: z.boolean().default(false),
});

export type UapEnvelope = z.infer<typeof UapEnvelopeSchema>;
export type UapHeader = z.infer<typeof UapHeaderSchema>;

export interface UapResponse {
  uap: UapHeader;
  result: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  };
}
