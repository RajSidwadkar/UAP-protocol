import Docker from 'dockerode';
import { ISandboxPort, SandboxResult } from '../../application/ports/i-sandbox-port';
import { PermissionScope } from '../../domain/capability-card';
import { UapSandboxError, UapValidationError } from '../../domain/errors';

/**
 * Manages a pool of warm Docker containers.
 * Industrialized implementation using exec for reuse.
 */
class ContainerPool {
  private available: Docker.Container[] = [];
  private readonly maxSize: number;

  constructor(
    private readonly docker: Docker,
    private readonly baseImage: string,
    maxSize: number
  ) {
    this.maxSize = maxSize;
  }

  async acquire(config: Docker.ContainerCreateOptions): Promise<Docker.Container> {
    let container = this.available.pop();
    
    if (container) {
      // Check if container is still alive
      try {
        const info = await container.inspect();
        if (!info.State.Running) {
          await container.start();
        }
        return container;
      } catch {
        // Container gone, fall through to create new one
      }
    }

    // Create a new "warm" container with a generic idle command
    const warmConfig: Docker.ContainerCreateOptions = {
      ...config,
      Image: this.baseImage,
      Cmd: ['tail', '-f', '/dev/null'], // Idle loop
      Entrypoint: [],
    };

    const newContainer = await this.docker.createContainer(warmConfig);
    await newContainer.start();
    return newContainer;
  }

  async release(container: Docker.Container): Promise<void> {
    if (this.available.length < this.maxSize) {
      this.available.push(container);
    } else {
      await container.remove({ force: true }).catch(() => {});
    }
  }

  size(): number {
    return this.available.length;
  }

  async drain(): Promise<void> {
    while (this.available.length > 0) {
      const c = this.available.pop();
      if (c) await c.remove({ force: true }).catch(() => {});
    }
  }
}

export class DockerSandboxAdapter implements ISandboxPort {
  private readonly docker: Docker;
  private readonly baseImage: string;
  private readonly pool: ContainerPool;

  constructor(socketPath: string, baseImage = 'uap-sandbox:latest', poolSize = 5) {
    this.docker = new Docker({ socketPath });
    this.baseImage = baseImage;
    this.pool = new ContainerPool(this.docker, this.baseImage, poolSize);
  }

  private static validateToolId(toolId: string): void {
    const SAFE_TOOL_ID = /^[a-zA-Z0-9_\-:]+$/;
    if (!SAFE_TOOL_ID.test(toolId)) {
      throw new UapValidationError(
        `Invalid toolId "${toolId}": only alphanumeric characters, hyphens, underscores, and colons are permitted`
      );
    }
    if (toolId.length > 128) {
      throw new UapValidationError(`toolId exceeds maximum length of 128 characters`);
    }
  }

  async execute(toolId: string, input: unknown, scope: PermissionScope[]): Promise<SandboxResult> {
    DockerSandboxAdapter.validateToolId(toolId);
    
    const start = Date.now();
    const Memory = 128 * 1024 * 1024;
    const CpuQuota = 50000;
    const ReadonlyRootfs = !scope.includes('fs:write');
    const NetworkDisabled = !scope.includes('network:egress');
    const CapDrop = ['ALL'];
    const CapAdd = this.scopeToCapabilities(scope);

    let container: Docker.Container | null = null;
    try {
      container = await this.pool.acquire({
        Image: this.baseImage,
        NetworkDisabled,
        HostConfig: {
          Memory,
          CpuQuota,
          ReadonlyRootfs,
          CapDrop,
          CapAdd,
        },
      });

      console.info({ kind: 'SANDBOX_CREATED', toolId, durationMs: 0 });

      // Use exec to run the actual tool command inside the warm container
      const exec = await container.exec({
        Cmd: ['node', '/tool/runner.js', toolId, JSON.stringify(input)],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});
      
      // Industrialized stream capture
      const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        
        // dockerode exec stream is multiplexed if TTY is false
        this.docker.modem.demuxStream(stream, {
          write: (chunk: Buffer) => { stdout += chunk.toString(); }
        } as any, {
          write: (chunk: Buffer) => { stderr += chunk.toString(); }
        } as any);

        stream.on('end', () => resolve({ stdout, stderr }));
        stream.on('error', (err) => reject(err));
      });

      const inspect = await exec.inspect();
      const StatusCode = inspect.ExitCode;
      const durationMs = Date.now() - start;

      console.info({ kind: 'SANDBOX_COMPLETED', toolId, durationMs, exitCode: StatusCode });

      if (StatusCode !== 0) {
        console.error({ kind: 'SANDBOX_FAILED', toolId, exitCode: StatusCode, stderr: output.stderr });
        throw new UapSandboxError(`Tool ${toolId} exited with code ${StatusCode}: ${output.stderr}`);
      }

      return {
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: StatusCode ?? 0,
        durationMs,
      };
    } catch (err) {
      if (err instanceof UapSandboxError || err instanceof UapValidationError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new UapSandboxError(`Sandbox execution failed: ${message}`);
    } finally {
      if (container) {
        await this.pool.release(container).catch(() => {});
      }
    }
  }

  async drainPool(): Promise<void> {
    await this.pool.drain();
  }

  async teardown(sandboxId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(sandboxId);
      await container.remove({ force: true });
    } catch (err) {
      // silently ignore
    }
  }

  private scopeToCapabilities(scope: PermissionScope[]): string[] {
    const map: Partial<Record<PermissionScope, string>> = {
      'net:bind': 'NET_BIND_SERVICE',
      'sys:time': 'SYS_TIME',
    };
    return scope.flatMap(s => (map[s] ? [map[s] as string] : []));
  }
}
