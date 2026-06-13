import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { CapabilityCard } from '../../domain/capability-card';
import { UapCardTamperedError, UapError } from '../../domain/errors';
import { AuditEvent } from '../../domain/audit-event';
import { requireScope } from '../plugins/require-scope.plugin';
import { validateEnvelope } from '../../domain/envelope';

export const agentRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  // Existing delegation route
  fastify.post('/delegate', {
    preHandler: requireScope(['task:submit']),
  }, async (request, reply) => {
    try {
      const envelope = validateEnvelope(request.body);
      container.rpcTransport.validate(envelope);
      const result = await container.delegateTask.execute(envelope, request.callerId);
      return result;
    } catch (err) {
      if (err instanceof UapError) {
        return reply.status(err.statusCode).send({ 
          code: err.code, 
          message: err.message,
          error: err.message 
        });
      }
      throw err;
    }
  });

  // Registry routes
  fastify.post('/registry/register', {
    preHandler: requireScope(['admin:write']),
  }, async (request, reply) => {
    try {
      const envelope = validateEnvelope(request.body);
      
      // Perform structural AJV validation via rpcTransport
      container.rpcTransport.validate(envelope);

      const { card, endpoint } = envelope.params as { card: CapabilityCard; endpoint: string };

      const isValid = await container.signer.verify(card);
      if (!isValid) {
        throw new UapCardTamperedError('Capability card signature is invalid');
      }

      await container.registry.register(card, endpoint);

      container.audit.publish(AuditEvent.create({
        kind: 'AGENT_REGISTERED',
        traceId: request.traceparent || (request.id as string),
        callerId: card.issuer,
        resource: endpoint,
        outcome: 'success',
        metadata: {
          agentId: card.issuer,
          version: card.version,
          tools: card.tools.map(t => t.id),
        },
      }));

      reply.code(201).send({ agentId: card.issuer });
    } catch (err) {
      if (err instanceof UapError) {
        return reply.status(err.statusCode).send({ 
          code: err.code, 
          message: err.message,
          error: err.message 
        });
      }
      throw err;
    }
  });

  fastify.delete('/registry/agents/:agentId', {
    preHandler: requireScope(['admin:write']),
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      await container.registry.deregister(agentId);

      container.audit.publish(AuditEvent.create({
        kind: 'AGENT_DEREGISTERED',
        traceId: request.traceparent || (request.id as string),
        callerId: request.uapClaims!.sub,
        resource: agentId,
        outcome: 'success',
        metadata: { agentId },
      }));

      reply.code(204).send();
    } catch (err) {
      if (err instanceof UapError) {
        return reply.status(err.statusCode).send({ 
          code: err.code, 
          message: err.message,
          error: err.message 
        });
      }
      throw err;
    }
  });

  fastify.get('/registry/agents', {
    preHandler: requireScope(['admin:read']),
  }, async (request, reply) => {
    try {
      const agents = await container.registry.list();
      return { agents };
    } catch (err) {
      if (err instanceof UapError) {
        return reply.status(err.statusCode).send({ 
          code: err.code, 
          message: err.message,
          error: err.message 
        });
      }
      throw err;
    }
  });
};
