import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { UapEnvelope } from '../../domain/envelope';

export const agentRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  fastify.post('/delegate', async (request, _reply) => {
    const envelope = request.body as UapEnvelope;
    const result = await container.delegateTask.execute(envelope);
    return result;
  });
};
