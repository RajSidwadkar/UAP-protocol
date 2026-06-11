import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppContainer } from '../../infrastructure/composition-root';
import { AuthClaims } from '../../application/ports/i-auth-port';

declare module 'fastify' {
  interface FastifyRequest {
    uapClaims: AuthClaims | null;
  }
}

export interface AuthPluginOptions {
  container: AppContainer;
}

const uapAuthPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorateRequest('uapClaims', null);

  app.addHook('preHandler', async (request, reply) => {
    // Health check is public
    if (request.url === '/health' || request.url.startsWith('/health')) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: 'Missing Authorization header' });
    }

    // Extract Bearer token case-insensitive
    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !/^Bearer$/i.test(scheme) || !token) {
      return reply.status(401).send({ error: 'Invalid Authorization header format' });
    }

    try {
      // Structural check only (signature, expiry, etc.)
      const claims = await opts.container.auth.verifyToken(token, []);
      request.uapClaims = claims;
    } catch (err: unknown) {
      return reply.status(401).send({ error: (err as Error).message });
    }
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default fp(uapAuthPlugin as any, {
  name: 'uap-auth',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
