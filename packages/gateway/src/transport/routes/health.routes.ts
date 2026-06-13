import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    try {
      return reply.send({
        status: 'ok',
        version: process.env['npm_package_version'] ?? 'unknown',
        uptime: process.uptime(),
      });
    } catch (err) {
      reply.status(500).send({ status: 'error', message: 'Health check failed' });
    }
  });
};

export default healthRoutes;
