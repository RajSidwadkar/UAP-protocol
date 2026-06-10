import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { ulid } from 'ulid';
import { AppContainer } from '../infrastructure/composition-root';
import uapAuthPlugin from './plugins/uap-auth.plugin';
import uapTracePlugin from './plugins/uap-trace.plugin';
import healthRoutes from './routes/health.routes';
import { toolRoutes } from './routes/tool.routes';
import { agentRoutes } from './routes/agent.routes';
import { AuditEvent } from '../domain/audit-event';

/**
 * Builds and configures the Fastify gateway instance.
 */
export async function buildGateway(container: AppContainer): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: { level: 'info' },
    trustProxy: true,
    bodyLimit: 1_048_576, // 1MB
    requestIdLogLabel: 'traceId',
    requestIdHeader: 'x-trace-id',
    genReqId: () => ulid(),
  });

  // 0. Global error handler (at the top to ensure it covers all plugins/routes)
  fastify.setErrorHandler(async (error: any, request, reply) => {
    // Log error for internal tracking
    request.log.error(error);

    // Emit AuditEvent
    const auditEvent = AuditEvent.create({
      kind: 'TOOL_FAILED',
      traceId: request.traceparent || (request.id as string),
      callerId: request.uapClaims?.sub || 'anonymous',
      resource: request.url,
      outcome: 'failure',
      metadata: {
        error: error.message,
        code: (error as any).code || 'INTERNAL_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    });
    container.audit.publish(auditEvent);

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.message,
      code: (error as any).code || 'INTERNAL_ERROR',
    });
  });

  // 1. Register security & utility plugins
  await fastify.register(helmet);
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await fastify.register(cors);

  // 2. Register UAP specific plugins
  await fastify.register(uapAuthPlugin, { container });
  await fastify.register(uapTracePlugin);

  // 3. Register routes
  await fastify.register(healthRoutes);
  await fastify.register(toolRoutes, { container, prefix: '/tools' });
  await fastify.register(agentRoutes, { container, prefix: '/agents' });

  return fastify;
}
