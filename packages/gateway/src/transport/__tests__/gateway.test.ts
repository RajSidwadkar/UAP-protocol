import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGateway } from '../fastify-gateway';
import { AppContainer } from '../../infrastructure/composition-root';
import { AuthClaims } from '../../application/ports/i-auth-port';
import { readFileSync } from 'fs';
import Fastify from 'fastify';

vi.mock('fs');
vi.mock('fastify', async (importOriginal) => {
  const original = await importOriginal<typeof import('fastify')>();
  return {
    ...original,
    default: vi.fn((options) => {
      // Strip https options for tests so inject() works without valid PEMs
      const { https, ...rest } = options || {};
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
        get: vi.fn(),
        list: vi.fn(),
      },
      invokeTool: {
        execute: vi.fn(),
      },
      delegateTask: {
        execute: vi.fn(),
      },
    } as unknown as AppContainer;
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
        uap: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        method: 'test/tool',
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
        uap: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        method: 'test/tool',
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
});
