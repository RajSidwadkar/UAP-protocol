import { describe, it, expect } from 'vitest';
import { UapEnvelopeSchema } from '../envelope';
import { ZodError } from 'zod';

const VALID_FIXTURE = {
  uap: {
    version: '1.0',
    type: 'tool_call',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    auth: {
      token: 'eyJhbGciOiJSUzI1NiJ9.test',
      scope: ['tool:read'],
      card_sig: 'ed25519:abc123'
    }
  },
  method: 'tools/invoke',
  schema_ref: 'uap:tool.invoke/v1',
  params: { tool_id: 'db:query', input: {} },
  ack: true
};

describe('UapEnvelopeSchema', () => {
  it('1. Valid full envelope -> UapEnvelopeSchema.parse() succeeds', () => {
    const result = UapEnvelopeSchema.parse(VALID_FIXTURE);
    expect(result).toEqual(VALID_FIXTURE);
  });

  it('2. Invalid ULID (wrong format) -> ZodError with path ["uap", "id"]', () => {
    const invalid = {
      ...VALID_FIXTURE,
      uap: { ...VALID_FIXTURE.uap, id: 'invalid-ulid' }
    };
    try {
      UapEnvelopeSchema.parse(invalid);
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      const error = e as ZodError;
      expect(error.issues[0]?.path).toEqual(['uap', 'id']);
    }
  });

  it('3. Invalid traceparent (too short) -> ZodError with path ["uap", "trace", "traceparent"]', () => {
    const invalid = {
      ...VALID_FIXTURE,
      uap: {
        ...VALID_FIXTURE.uap,
        trace: { traceparent: 'short' }
      }
    };
    try {
      UapEnvelopeSchema.parse(invalid);
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      const error = e as ZodError;
      expect(error.issues[0]?.path).toEqual(['uap', 'trace', 'traceparent']);
    }
  });

  it('4. Empty scope array -> ZodError', () => {
    const invalid = {
      ...VALID_FIXTURE,
      uap: {
        ...VALID_FIXTURE.uap,
        auth: { ...VALID_FIXTURE.uap.auth, scope: [] }
      }
    };
    expect(() => UapEnvelopeSchema.parse(invalid)).toThrow(ZodError);
  });

  it('5. card_sig without "ed25519:" prefix -> ZodError', () => {
    const invalid = {
      ...VALID_FIXTURE,
      uap: {
        ...VALID_FIXTURE.uap,
        auth: { ...VALID_FIXTURE.uap.auth, card_sig: 'abc123' }
      }
    };
    expect(() => UapEnvelopeSchema.parse(invalid)).toThrow(ZodError);
  });

  it('6. Unknown type enum value -> ZodError', () => {
    const invalid = {
      ...VALID_FIXTURE,
      uap: { ...VALID_FIXTURE.uap, type: 'unknown' }
    };
    expect(() => UapEnvelopeSchema.parse(invalid)).toThrow(ZodError);
  });

  it('7. schema_ref without "uap:" prefix -> ZodError', () => {
    const invalid = {
      ...VALID_FIXTURE,
      schema_ref: 'invalid:ref'
    };
    expect(() => UapEnvelopeSchema.parse(invalid)).toThrow(ZodError);
  });

  it('8. Missing required field "method" -> ZodError', () => {
    const { method: _method, ...invalid } = VALID_FIXTURE;
    expect(() => UapEnvelopeSchema.parse(invalid)).toThrow(ZodError);
  });

  it('9. ack defaults to false when omitted', () => {
    const { ack: _ack, ...omittedAck } = VALID_FIXTURE;
    const result = UapEnvelopeSchema.parse(omittedAck);
    expect(result.ack).toBe(false);
  });
});
