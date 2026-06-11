import { z } from 'zod';
import { UapValidationError } from './errors';

export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const TraceparentSchema = z.string().regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/);

const PermissionScopeSchema = z.enum([
  'tool:read',
  'tool:write',
  'network:egress',
  'fs:write',
  'net:bind',
  'sys:time',
  'task:submit',
  'task:read',
  'task:cancel',
  'admin:read',
  'admin:write',
]);

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
    scope: z.array(PermissionScopeSchema).min(1),
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

export interface UapResponse {
  uap: UapHeader;
  result: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Validates data against the UapEnvelopeSchema.
 * Throws UapValidationError on failure.
 */
export function validateEnvelope(raw: unknown): UapEnvelope {
  const result = UapEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new UapValidationError(`Envelope validation failed — ${details}`);
  }
  return result.data;
}
