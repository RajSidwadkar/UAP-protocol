import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

/**
 * A preHandler factory that enforces the presence of specific scopes in the authenticated request.
 */
export function requireScope(scope: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.uapRawToken;
    if (!token) {
      return reply.status(401).send({ error: 'Missing Authorization header' });
    }

    try {
      const claims = await request.server.uapContainer.auth.verifyToken(token, scope);
      request.uapClaims = claims;
      request.callerId = claims.sub;
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 403;
      return reply.status(statusCode).send({ error: error.message });
    }
  };
}
