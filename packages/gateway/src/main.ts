import { buildContainer } from './infrastructure/composition-root';
import { buildGateway } from './transport/fastify-gateway';
import { AuditEvent } from './domain/audit-event';

/**
 * Main entry point for the UAP Gateway.
 */
async function start() {
  const container = buildContainer();
  const gateway = await buildGateway(container);

  const port = Number(process.env.UAP_GATEWAY_PORT) || 3000;
  const host = '0.0.0.0';

  try {
    await gateway.listen({ port, host });

    // Emit AuditEvent { kind: 'GATEWAY_STARTED' } after successful listen
    container.audit.publish(AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: 'SYSTEM',
      callerId: 'SYSTEM',
      resource: `http://${host}:${port}`,
      outcome: 'success',
      metadata: {
        version: process.env.npm_package_version,
        node_version: process.version,
      },
    }));

    gateway.log.info(`Gateway started and listening on ${host}:${port}`);
  } catch (err) {
    gateway.log.error(err);
    process.exit(1);
  }
}

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  start();
}

export { start };
