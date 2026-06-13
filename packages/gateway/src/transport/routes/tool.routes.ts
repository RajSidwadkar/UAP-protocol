import { FastifyPluginAsync } from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';
import { validateEnvelope } from '../../domain/envelope';
import { requireScope } from '../plugins/require-scope.plugin';
import { UapError } from '../../domain/errors';

export const toolRoutes: FastifyPluginAsync<{ container: AppContainer }> = async (fastify, { container }) => {
  fastify.post('/invoke', {
    preHandler: requireScope(['tool:read']),
  }, async (request, reply) => {
    try {
      const envelope = validateEnvelope(request.body);
      container.rpcTransport.validate(envelope);
      const result = await container.invokeTool.execute(envelope, request.callerId);
      return result;
    } catch (err) {
      if (err instanceof UapError) {
        return reply.status(err.statusCode).send({ 
          code: err.code, 
          message: err.message,
          error: err.message // Compatibility with existing tests
        });
      }
      throw err;
    }
  });
};
