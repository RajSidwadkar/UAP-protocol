import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { decodeJwt } from 'jose';
import { AppContainer } from '../../infrastructure/composition-root';
import { AuthClaims } from '../../application/ports/i-auth-port';

declare module 'fastify' {
  interface FastifyInstance {
    uapContainer: AppContainer;
  }
  interface FastifyRequest {
    uapClaims: AuthClaims | null;
    callerId: string;
    uapRawToken: string;
  }
}

export interface AuthPluginOptions {
  container: AppContainer;
}

const uapAuthPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorate('uapContainer', opts.container);
  app.decorateRequest('uapClaims', null);
  app.decorateRequest('callerId', '');
  app.decorateRequest('uapRawToken', '');

  app.addHook('onRequest', async (request, reply) => {
    // Health check is public
    if (request.url === '/health' || request.url.startsWith('/health')) {
      return;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Skip — requireScope will reject if route needs auth
      return;
    }

    const token = authHeader.slice(7);
    try {
      const payload = decodeJwt(token);
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return reply.status(401).send({ error: 'Token expired' });
      }
      // Store raw token string for requireScope to use
      request.uapRawToken = token;
    } catch {
      return reply.status(401).send({ error: 'Malformed token' });
    }
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default fp(uapAuthPlugin as any, {
  name: 'uap-auth',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
