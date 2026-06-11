import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

/**
 * A preHandler factory that enforces the presence of specific scopes in the authenticated request.
 */
export function requireScope(scope: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // If no scopes are required, proceed immediately
    if (scope.length === 0) {
      return;
    }

    const granted = request.uapClaims?.scope ?? [];
    const missing = scope.filter(s => !granted.includes(s));

    if (missing.length > 0) {
      return reply.status(403).send({
        error: `Missing scopes: ${missing.join(', ')}`,
      });
    }
  };
}
