import { describe, it, expect, vi } from 'vitest';
import { requireScope } from '../require-scope.plugin';
import { FastifyRequest, FastifyReply } from 'fastify';

type SimplePreHandler = (
  req: FastifyRequest,
  res: FastifyReply,
  done: () => void
) => Promise<void>;

interface MockClaims {
  scope: string[];
}

interface ScopeError extends Error {
  statusCode: number;
}

describe('requireScope()', () => {
  const done = vi.fn();

  const createMockRequest = (token: string, mockClaims?: MockClaims, errorToThrow?: ScopeError) => ({
    uapRawToken: token,
    server: {
      uapContainer: {
        auth: {
          verifyToken: vi.fn().mockImplementation(async (_t, _s) => {
            if (errorToThrow) throw errorToThrow;
            return mockClaims;
          }),
        },
      },
    },
  } as unknown as FastifyRequest);

  it('1. Empty required scope [] → preHandler returns immediately (proceeds)', async () => {
    const preHandler = requireScope([]);
    const request = createMockRequest('token', { scope: [] });
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('2. Token with matching scope → preHandler proceeds', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = createMockRequest('token', {
      scope: ['tool:read', 'other:scope']
    });
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('3. Token missing one required scope → preHandler returns 403 with missing scope', async () => {
    const preHandler = requireScope(['tool:read', 'admin:write']);
    
    const scopeError = new Error('Missing scopes: admin:write') as ScopeError;
    scopeError.statusCode = 403;
    
    const request = createMockRequest('token', undefined, scopeError);
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing scopes: admin:write',
    });
  });

  it('4. Token missing multiple required scopes → 403 with all missing scopes listed', async () => {
    const preHandler = requireScope(['tool:read', 'admin:write', 'task:submit']);
    
    const scopeError = new Error('Missing scopes: tool:read, admin:write, task:submit') as ScopeError;
    scopeError.statusCode = 403;

    const request = createMockRequest('token', undefined, scopeError);
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing scopes: tool:read, admin:write, task:submit',
    });
  });

  it('5. request.uapRawToken is missing → returns 401', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = { uapRawToken: '' } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing Authorization header',
    });
  });

  it('6. Token with extra scopes beyond required → still passes', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = createMockRequest('token', {
      scope: ['tool:read', 'admin:write', 'extra:scope']
    });
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
