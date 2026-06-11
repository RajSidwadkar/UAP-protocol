import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { UapEnvelope } from '../../domain/envelope';
import { requireScope } from '../plugins/require-scope.plugin';

export const toolRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  fastify.post('/invoke', {
    preHandler: requireScope(['tool:read']),
  }, async (request, _reply) => {
    const envelope = request.body as UapEnvelope;
    const result = await container.invokeTool.execute(envelope);
    return result;
  });
};
