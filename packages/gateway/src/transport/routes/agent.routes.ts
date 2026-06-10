import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { UapEnvelope } from '../../domain/envelope';
import { CapabilityCard } from '../../domain/capability-card';
import { UapCardTamperedError, UapForbiddenError } from '../../domain/errors';
import { AuditEvent } from '../../domain/audit-event';

export const agentRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  // Existing delegation route
  fastify.post('/delegate', async (request, _reply) => {
    const envelope = request.body as UapEnvelope;
    const result = await container.delegateTask.execute(envelope);
    return result;
  });

  // Registry routes
  fastify.post('/registry/register', async (request, reply) => {
    const { card, endpoint } = request.body as { card: CapabilityCard; endpoint: string };

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
  });

  fastify.delete('/registry/agents/:agentId', async (request, reply) => {
    // Requires 'admin:write' scope
    if (!request.uapClaims?.scope.includes('admin:write')) {
      throw new UapForbiddenError('Missing admin:write scope');
    }

    const { agentId } = request.params as { agentId: string };
    await container.registry.deregister(agentId);

    container.audit.publish(AuditEvent.create({
      kind: 'AGENT_DEREGISTERED',
      traceId: request.traceparent || (request.id as string),
      callerId: request.uapClaims.sub,
      resource: agentId,
      outcome: 'success',
      metadata: { agentId },
    }));

    reply.code(204).send();
  });

  fastify.get('/registry/agents', async (request) => {
    // Requires 'admin:read' scope
    if (!request.uapClaims?.scope.includes('admin:read')) {
      throw new UapForbiddenError('Missing admin:read scope');
    }

    const agents = await container.registry.list();
    return { agents };
  });
};
