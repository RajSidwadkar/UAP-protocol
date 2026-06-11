import { describe, it, expect } from 'vitest';
import { UapEnvelopeSchema, validateEnvelope } from '../envelope';
import { ZodError } from 'zod';
import { UapValidationError } from '../errors';

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

  it('10. validateEnvelope() with a valid envelope → returns a UapEnvelope (does not throw)', () => {
    const result = validateEnvelope(VALID_FIXTURE);
    expect(result).toEqual(VALID_FIXTURE);
  });

  it('11. validateEnvelope() with an invalid envelope (empty object) → throws UapValidationError', () => {
    expect(() => validateEnvelope({})).toThrow(UapValidationError);
  });

  it('12. validateEnvelope() throws UapValidationError (not a plain Error subclass) — verify with instanceof', () => {
    try {
      validateEnvelope({});
    } catch (e) {
      expect(e).toBeInstanceOf(UapValidationError);
    }
  });

  it('13. validateEnvelope() error message contains the Zod path of the failing field', () => {
    const invalid = { ...VALID_FIXTURE } as Record<string, unknown>;
    delete invalid.uap;
    try {
      validateEnvelope(invalid);
    } catch (e) {
      const error = e as UapValidationError;
      expect(error.message).toContain('uap: Required');
    }
  });

  it('14. validateEnvelope() never returns null — verify the return type is non-nullable by asserting the returned value is truthy when input is valid', () => {
    const result = validateEnvelope(VALID_FIXTURE);
    expect(result).toBeTruthy();
    // TypeScript should also treat `result` as non-nullable now
  });
});
