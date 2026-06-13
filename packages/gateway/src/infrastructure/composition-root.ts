import * as fs from 'fs';
import { KeycloakAuthAdapter } from './auth/keycloak-auth-adapter';
import { Ed25519SignerAdapter } from './signing/ed25519-signer';
import { DockerSandboxAdapter } from './sandbox/docker-sandbox-adapter';
import { AuditEventBus } from '../application/audit-event-bus';
import { PinoAuditAdapter } from './audit/pino-audit-adapter';
import { OtelTraceAdapter } from './trace/otel-trace-adapter';
import { InMemoryRegistryAdapter } from './registry/in-memory-registry-adapter';
import { RedisRegistryAdapter } from './registry/redis-registry-adapter';
import { UapRpcTransport } from '../transport/uap-rpc';
import { InvokeToolUseCase } from '../application/use-cases/invoke-tool.use-case';
import { DelegateTaskUseCase } from '../application/use-cases/delegate-task.use-case';
import { RouteToolCallUseCase } from '../application/use-cases/route-tool-call.use-case';
import { IAuthPort } from '../application/ports/i-auth-port';
import { ICardSignerPort } from '../domain/capability-card';
import { ISandboxPort } from '../application/ports/i-sandbox-port';
import { IAuditPublisher } from '../application/audit-event-bus';
import { IRegistryPort } from '../application/ports/i-registry-port';

import { PinoLoggerAdapter } from './logging/pino-logger-adapter';

export interface AppContainer {
  auth: IAuthPort;
  signer: ICardSignerPort;
  sandbox: ISandboxPort;
  audit: IAuditPublisher;
  registry: IRegistryPort;
  rpcTransport: UapRpcTransport;
  invokeTool: InvokeToolUseCase;
  delegateTask: DelegateTaskUseCase;
  routeToolCall: RouteToolCallUseCase;
}

type Env = NodeJS.ProcessEnv;

async function buildRegistry(env: Env): Promise<IRegistryPort> {
  if (!env.REDIS_URL) return new InMemoryRegistryAdapter();
  
  const redis = new RedisRegistryAdapter(env.REDIS_URL);
  
  // Give Redis 3 seconds to connect; fallback to InMemory on timeout
  const connected = await Promise.race([
    new Promise<boolean>(resolve => {
      redis['client'].once('ready', () => resolve(true));
      redis['client'].once('error', () => resolve(false));
    }),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
  ]);

  if (!connected) {
    console.warn({ kind: 'REGISTRY_FALLBACK', reason: 'Redis unreachable, using InMemoryRegistryAdapter' });
    return new InMemoryRegistryAdapter();
  }

  return redis;
}

/**
 * The single Dependency Injection root.
 * All concrete class instantiation lives here.
 */
export async function buildContainer(): Promise<AppContainer> {
  const env = process.env;
  const appLogger = new PinoLoggerAdapter();

  // 1. KeycloakAuthAdapter
  const auth = new KeycloakAuthAdapter(
    env.KEYCLOAK_URL || 'http://localhost:8080',
    env.KEYCLOAK_REALM || 'uap',
    env.UAP_AUDIENCE || 'gateway'
  );

  // 2. Ed25519SignerAdapter
  const signingKeyPath = env.UAP_SIGNING_KEY_PATH || 'certs/signing.key';
  let signingKey = '';
  try {
    signingKey = fs.readFileSync(signingKeyPath, 'utf8').trim();
  } catch (err) {
    appLogger.warn(`Warning: Could not read signing key at ${signingKeyPath}. Using empty string.`);
  }
  const signer = new Ed25519SignerAdapter(signingKey);

  // 3. DockerSandboxAdapter
  const sandbox = new DockerSandboxAdapter(
    env.UAP_DOCKER_SOCKET ?? '/var/run/docker.sock'
  );

  // 4. AuditEventBus
  const audit = new AuditEventBus(appLogger);
  const logDir = env.UAP_AUDIT_LOG_DIR || 'logs';
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      appLogger.error(`Failed to create audit log directory: ${logDir}`, { error: (err as Error).message });
    }
  }
  audit.subscribe(new PinoAuditAdapter(logDir));
  audit.subscribe(new OtelTraceAdapter());

  // 5. Registry Adapter
  const registry = await buildRegistry(env);

  // 6. RPC Transport
  const rpcTransport = new UapRpcTransport();

  // Use cases
  const invokeTool = new InvokeToolUseCase(sandbox, audit);
  const delegateTask = new DelegateTaskUseCase(registry);
  const routeToolCall = new RouteToolCallUseCase(registry, audit);

  return {
    auth,
    signer,
    sandbox,
    audit,
    registry,
    rpcTransport,
    invokeTool,
    delegateTask,
    routeToolCall,
  };
}
