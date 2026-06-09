import { describe, it, expect, vi, beforeEach } from 'vitest';
import Ajv from 'ajv';
import { UapRpcTransport } from '../uap-rpc';
import { UapValidationError, UapUnknownSchemaRefError } from '../../domain/errors';
import { UapEnvelope } from '../../domain/envelope';

const VALID_FIXTURE: UapEnvelope = {
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

describe('UapRpcTransport', () => {
  let transport: UapRpcTransport;

  beforeEach(() => {
    transport = new UapRpcTransport();
  });

  it('1. validate() valid params for "uap:tool.invoke/v1" → does NOT throw', () => {
    expect(() => transport.validate(VALID_FIXTURE)).not.toThrow();
  });

  it('2. validate() missing required "tool_id" → throws UapValidationError', () => {
    const invalid = { ...VALID_FIXTURE, params: { input: {} } } as UapEnvelope;
    expect(() => transport.validate(invalid)).toThrow(UapValidationError);
  });

  it('3. validate() unknown schema_ref "uap:unknown/v1" → throws UapUnknownSchemaRefError', () => {
    const unknown = { ...VALID_FIXTURE, schema_ref: 'uap:unknown/v1' } as UapEnvelope;
    expect(() => transport.validate(unknown)).toThrow(UapUnknownSchemaRefError);
  });

  it('4. validate() called twice with same schema_ref → AJV compile called only ONCE', () => {
    const ajv = (transport as unknown as { ajv: Ajv }).ajv;
    const spy = vi.spyOn(ajv, 'compile');

    transport.validate(VALID_FIXTURE);
    transport.validate(VALID_FIXTURE);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('5. executeBatch() serial: second of three fails → first result returned, error thrown, third never called', async () => {
    const requests: UapEnvelope[] = [
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' } },
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAX' }, params: {} }, // missing tool_id -> fail
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAY' } },
    ];

    const validateSpy = vi.spyOn(transport, 'validate');

    await expect(transport.executeBatch({ semantics: 'serial', requests })).rejects.toThrow(UapValidationError);

    // Should have called validate for 1 and 2, but not 3
    expect(validateSpy).toHaveBeenCalledTimes(2);
    expect(validateSpy).toHaveBeenNthCalledWith(1, requests[0]);
    expect(validateSpy).toHaveBeenNthCalledWith(2, requests[1]);
  });

  it('6. executeBatch() parallel: all three run → Promise.all semantics verified via vi.fn() spies', async () => {
    const requests: UapEnvelope[] = [
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' } },
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAX' } },
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAY' } },
    ];

    const validateSpy = vi.spyOn(transport, 'validate');

    const results = await transport.executeBatch({ semantics: 'parallel', requests });

    expect(results).toHaveLength(3);
    expect(validateSpy).toHaveBeenCalledTimes(3);
  });

  it('7. executeBatch() transactional: any failure → throws error', async () => {
    const requests: UapEnvelope[] = [
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' } },
      { ...VALID_FIXTURE, uap: { ...VALID_FIXTURE.uap, id: '01ARZ3NDEKTSV4RRFFQ69G5FAX' }, params: {} }, // fail
    ];

    await expect(transport.executeBatch({ semantics: 'transactional', requests })).rejects.toThrow(UapValidationError);
  });
});
