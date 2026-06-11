import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as crypto from 'node:crypto';

declare module 'fastify' {
  interface FastifyRequest {
    traceparent: string;
  }
}

const uapTracePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('traceparent', '');

  fastify.addHook('onRequest', async (request) => {
    let traceparent = request.headers['traceparent'] as string;
    
    const isValid = /^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/.test(traceparent || '');

    if (!traceparent || !isValid) {
      const traceId = crypto.randomBytes(16).toString('hex');
      const spanId = crypto.randomBytes(8).toString('hex');
      traceparent = `00-${traceId}-${spanId}-01`;
    }

    request.traceparent = traceparent;
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.traceparent) {
      reply.header('traceparent', request.traceparent);
    }
    return payload;
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default fp(uapTracePlugin as any, {
  name: 'uap-trace',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
