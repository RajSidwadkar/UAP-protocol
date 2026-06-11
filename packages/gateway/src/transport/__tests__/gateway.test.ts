import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGateway } from '../fastify-gateway';
import { AppContainer } from '../../infrastructure/composition-root';
import { AuthClaims } from '../../application/ports/i-auth-port';
import { readFileSync } from 'fs';

vi.mock('fs');
vi.mock('fastify', async (importOriginal) => {
  const original = await importOriginal<typeof import('fastify')>();
  return {
    ...original,
    default: vi.fn((options) => {
      // Strip https options for tests so inject() works without valid PEMs
      const { https: _https, ...rest } = options || {};
      return original.default(rest);
    }),
  };
});


describe('Gateway', () => {
  let container: AppContainer;

  beforeEach(() => {
    // Set required environment variables for TLS
    process.env.UAP_MTLS_CERT = 'test-cert.pem';
    process.env.UAP_MTLS_KEY = 'test-key.pem';
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('MOCK_CERT_DATA'));

    // Mock the container and all its dependencies
    container = {
      auth: {
        verifyToken: vi.fn(),
        introspect: vi.fn(),
      },
      signer: {
        sign: vi.fn(),
        verify: vi.fn(),
      },
      sandbox: {
        execute: vi.fn(),
        teardown: vi.fn(),
      },
      audit: {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      },
      registry: {
        register: vi.fn(),
        deregister: vi.fn(),
        resolve: vi.fn(),
        list: vi.fn(),
      },
      rpcTransport: {
        validate: vi.fn(),
      },
      invokeTool: {
        execute: vi.fn(),
      },
      delegateTask: {
        execute: vi.fn(),
      },
    } as unknown as AppContainer;

    vi.mocked(container.registry.resolve).mockResolvedValue({
      agentId: 'user-1',
      endpoint: 'http://local',
      card: {
        issuer: 'user-1',
        version: '1.0',
        tools: [],
        scopes: ['tool:read', 'task:submit'],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10000,
        signature: 'ed25519:abc'
      },
      registeredAt: Date.now(),
      lastHeartbeat: Date.now()
    });
    vi.mocked(container.signer.verify).mockResolvedValue(true);
  });

  it('GET /health returns 200 { status: "ok" }', async () => {
    const gateway = await buildGateway(container);
    const response = await gateway.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('POST /tools/invoke without Authorization header returns 401', async () => {
    const gateway = await buildGateway(container);
    const response = await gateway.inject({
      method: 'POST',
      url: '/tools/invoke',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'Missing Authorization header' });
  });

  it('POST /tools/invoke with valid JWT returns 200', async () => {
    const claims = new AuthClaims('user-1', ['tool:read'], 0, 0, 'iss');
    vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
    vi.mocked(container.invokeTool.execute).mockResolvedValue({ result: 'success' });

    const gateway = await buildGateway(container);
    const response = await gateway.inject({
      method: 'POST',
      url: '/tools/invoke',
      headers: {
        authorization: 'Bearer valid-token',
      },
      payload: {
        uap: {
          version: '1.0',
          type: 'tool_call',
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
          auth: {
            token: 'valid-token',
            scope: ['tool:read'],
            card_sig: 'ed25519:abc'
          }
        },
        method: 'test/tool',
        schema_ref: 'uap:test',
        params: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ result: 'success' });
  });

  it('POST /tools/invoke with body > 1MB returns 413', async () => {
    const gateway = await buildGateway(container);
    // Create a body slightly larger than 1MB
    const largeBody = 'a'.repeat(1_048_576 + 100);
    const response = await gateway.inject({
      method: 'POST',
      url: '/tools/invoke',
      headers: {
        authorization: 'Bearer valid-token',
      },
      payload: { data: largeBody },
    });

    expect(response.statusCode).toBe(413);
  });

  it('Route that throws an error emits AuditEvent with kind "TOOL_FAILED"', async () => {
    const claims = new AuthClaims('user-1', ['tool:read'], 0, 0, 'iss');
    vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
    // Force a failure in the use case
    vi.mocked(container.invokeTool.execute).mockRejectedValue(new Error('Test failure'));

    const gateway = await buildGateway(container);
    await gateway.inject({
      method: 'POST',
      url: '/tools/invoke',
      headers: {
        authorization: 'Bearer valid-token',
      },
      payload: {
        uap: {
          version: '1.0',
          type: 'tool_call',
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
          auth: {
            token: 'valid-token',
            scope: ['tool:read'],
            card_sig: 'ed25519:abc'
          }
        },
        method: 'test/tool',
        schema_ref: 'uap:test',
        params: {},
      },
    });

    // Verify that the audit event was published
    expect(container.audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'TOOL_FAILED',
        outcome: 'failure',
      })
    );
  });

  describe('Envelope validation at route boundary', () => {
    const VALID_ENVELOPE = {
      uap: {
        version: '1.0',
        type: 'tool_call',
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        trace: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
        auth: {
          token: 'valid-token',
          scope: ['tool:read'],
          card_sig: 'ed25519:abc'
        }
      },
      method: 'test/tool',
      schema_ref: 'uap:test',
      params: {},
    };

    it('1. POST /tools/invoke with empty body {} → HTTP 422 response', async () => {
      const claims = new AuthClaims('user-1', ['tool:read'], 0, 0, 'iss');
      vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
      const gateway = await buildGateway(container);
      const response = await gateway.inject({
        method: 'POST',
        url: '/tools/invoke',
        headers: { authorization: 'Bearer valid-token' },
        payload: {},
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toContain('Envelope validation failed');
    });

    it('2. POST /tools/invoke with valid envelope → use-case called', async () => {
      const claims = new AuthClaims('user-1', ['tool:read'], 0, 0, 'iss');
      vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
      vi.mocked(container.invokeTool.execute).mockResolvedValue({ result: 'ok' });
      const gateway = await buildGateway(container);
      const response = await gateway.inject({
        method: 'POST',
        url: '/tools/invoke',
        headers: { authorization: 'Bearer valid-token' },
        payload: VALID_ENVELOPE,
      });
      expect(response.statusCode).toBe(200);
      expect(container.invokeTool.execute).toHaveBeenCalled();
    });

    it('3. POST /agent/delegate with malformed body (missing uap field) → HTTP 422 response', async () => {
      const claims = new AuthClaims('user-1', ['task:submit'], 0, 0, 'iss');
      vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
      const gateway = await buildGateway(container);
      const response = await gateway.inject({
        method: 'POST',
        url: '/agents/delegate',
        headers: { authorization: 'Bearer valid-token' },
        payload: { method: 'delegate' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toContain('Envelope validation failed');
    });

    it('4. POST /agent/delegate with valid envelope → use-case called', async () => {
      const claims = new AuthClaims('user-1', ['task:submit'], 0, 0, 'iss');
      vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
      vi.mocked(container.delegateTask.execute).mockResolvedValue({ result: 'ok' });
      const gateway = await buildGateway(container);
      const response = await gateway.inject({
        method: 'POST',
        url: '/agents/delegate',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ...VALID_ENVELOPE, uap: { ...VALID_ENVELOPE.uap, type: 'agent_delegate' } },
      });
      expect(response.statusCode).toBe(200);
      expect(container.delegateTask.execute).toHaveBeenCalled();
    });

    it('5. Validation error response body has shape: { error: <string containing "Envelope validation failed"> }', async () => {
      const claims = new AuthClaims('user-1', ['tool:read'], 0, 0, 'iss');
      vi.mocked(container.auth.verifyToken).mockResolvedValue(claims);
      const gateway = await buildGateway(container);
      const response = await gateway.inject({
        method: 'POST',
        url: '/tools/invoke',
        headers: { authorization: 'Bearer valid-token' },
        payload: { uap: { version: '1.0' } },
      });
      expect(response.json()).toMatchObject({
        error: expect.stringContaining('Envelope validation failed'),
      });
    });
  });
});
