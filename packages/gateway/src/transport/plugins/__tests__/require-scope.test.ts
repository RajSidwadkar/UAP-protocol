import { describe, it, expect, vi } from 'vitest';
import { requireScope } from '../require-scope.plugin';
import { FastifyRequest, FastifyReply } from 'fastify';

type SimplePreHandler = (
  req: FastifyRequest,
  res: FastifyReply,
  done: () => void
) => Promise<void>;

describe('requireScope()', () => {
  const done = vi.fn();

  it('1. Empty required scope [] → preHandler returns immediately (proceeds)', async () => {
    const preHandler = requireScope([]);
    const request = {} as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('2. Token with matching scope → preHandler proceeds', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = {
      uapClaims: { scope: ['tool:read', 'other:scope'] }
    } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('3. Token missing one required scope → preHandler returns 403 with missing scope', async () => {
    const preHandler = requireScope(['tool:read', 'admin:write']);
    const request = {
      uapClaims: { scope: ['tool:read'] }
    } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing scopes: admin:write',
    });
  });

  it('4. Token missing multiple required scopes → 403 with all missing scopes listed', async () => {
    const preHandler = requireScope(['tool:read', 'admin:write', 'task:submit']);
    const request = {
      uapClaims: { scope: ['other:scope'] }
    } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing scopes: tool:read, admin:write, task:submit',
    });
  });

  it('5. request.uapClaims is null → treated as empty scope → 403', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = { uapClaims: null } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Missing scopes: tool:read',
    });
  });

  it('6. Token with extra scopes beyond required → still passes', async () => {
    const preHandler = requireScope(['tool:read']);
    const request = {
      uapClaims: { scope: ['tool:read', 'admin:write', 'extra:scope'] }
    } as unknown as FastifyRequest;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;

    await (preHandler as unknown as SimplePreHandler)(request, reply, done);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
