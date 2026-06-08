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
    card_sig: z.string().regex(/^ed25519:/),
  }),
});

export const UapEnvelopeSchema = z.object({
  uap: UapHeaderSchema,
  method: z.string().regex(/^[a-z]+\/[a-z_]+$/),
  schema_ref: z.string().startsWith('uap:'),
  params: z.record(z.unknown()),
  ack: z.boolean().default(false),
});

export type UapEnvelope = z.infer<typeof UapEnvelopeSchema>;
export type UapHeader = z.infer<typeof UapHeaderSchema>;

/**
 * Validates data against the UapEnvelopeSchema.
 * On failure, emits a structured console.warn as per requirements.
 */
export const validateEnvelope = (data: unknown): UapEnvelope | null => {
  const result = UapEnvelopeSchema.safeParse(data);
  if (!result.success) {
    console.warn({
      kind: 'SCHEMA_VIOLATION',
      path: result.error.issues.map(i => i.path),
      message: result.error.message,
    });
    return null;
  }
  return result.data;
};
