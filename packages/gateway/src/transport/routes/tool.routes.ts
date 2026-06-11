import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { validateEnvelope } from '../../domain/envelope';
import { requireScope } from '../plugins/require-scope.plugin';

export const toolRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  fastify.post('/invoke', {
    preHandler: requireScope(['tool:read']),
  }, async (request, _reply) => {
    const envelope = validateEnvelope(request.body);
    container.rpcTransport.validate(envelope);
    const result = await container.invokeTool.execute(envelope);
    return result;
  });
};
