import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      version: process.env.npm_package_version,
      uptime: process.uptime(),
    };
  });
};

export default healthRoutes;
