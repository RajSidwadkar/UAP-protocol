import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { UapEnvelope } from '../../domain/envelope';

export const toolRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  fastify.post('/invoke', async (request, reply) => {
    const envelope = request.body as UapEnvelope;
    const result = await container.invokeTool.execute(envelope);
    return result;
  });
};
