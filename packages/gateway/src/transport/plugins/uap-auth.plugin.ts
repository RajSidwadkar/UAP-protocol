import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppContainer } from '../../infrastructure/composition-root';
import { AuthClaims } from '../../application/ports/i-auth-port';

declare module 'fastify' {
  interface FastifyRequest {
    uapClaims?: AuthClaims;
  }
}

export interface AuthPluginOptions {
  container: AppContainer;
}

const uapAuthPlugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options) => {
  const { container } = options;

  fastify.decorateRequest('uapClaims', undefined);

  fastify.addHook('preHandler', async (request, reply) => {
    // Health check is public
    if (request.url === '/health' || request.url.startsWith('/health')) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({ error: 'Missing Authorization header' });
      return;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      reply.code(401).send({ error: 'Invalid Authorization header format' });
      return;
    }

    try {
      const claims = await container.auth.verifyToken(token, []);
      request.uapClaims = claims;
    } catch (err: any) {
      reply.code(401).send({ error: err.message });
    }
  });
};

export default fp(uapAuthPlugin, {
  name: 'uap-auth',
});
