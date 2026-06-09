import Docker from 'dockerode';
import { ISandboxPort, SandboxResult } from '../../application/ports/i-sandbox-port';
import { PermissionScope } from '../../domain/capability-card';
import { UapSandboxError } from '../../domain/errors';

export class DockerSandboxAdapter implements ISandboxPort {
  private readonly docker: Docker;
  private readonly baseImage: string;

  constructor(socketPath: string, baseImage = 'uap-sandbox:latest') {
    this.docker = new Docker({ socketPath });
    this.baseImage = baseImage;
  }

  async execute(toolId: string, input: unknown, scope: PermissionScope[]): Promise<SandboxResult> {
    const start = Date.now();
    const Memory = 128 * 1024 * 1024;
    const CpuQuota = 50000;
    const AutoRemove = true;
    const ReadonlyRootfs = !scope.includes('fs:write');
    const NetworkDisabled = !scope.includes('network:egress');
    const CapDrop = ['ALL'];
    const CapAdd = this.scopeToCapabilities(scope);

    try {
      console.info({ kind: 'SANDBOX_CREATED', toolId, durationMs: 0 });

      const container = await this.docker.createContainer({
        Image: this.baseImage,
        Cmd: ['node', '/tool/runner.js', toolId, JSON.stringify(input)],
        NetworkDisabled,
        HostConfig: {
          Memory,
          CpuQuota,
          AutoRemove,
          ReadonlyRootfs,
          CapDrop,
          CapAdd,
        },
      });

      await container.start();
      const logs = await container.logs({ stdout: true, stderr: true, follow: true });
      const waitResult = await container.wait();
      const StatusCode = waitResult.StatusCode;
      const durationMs = Date.now() - start;

      console.info({ kind: 'SANDBOX_COMPLETED', toolId, durationMs, exitCode: StatusCode });

      if (StatusCode !== 0) {
        console.error({ kind: 'SANDBOX_FAILED', toolId, exitCode: StatusCode, stderr: '' });
        throw new UapSandboxError(`Tool ${toolId} exited with code ${StatusCode}`);
      }

      return {
        stdout: logs.toString(),
        stderr: '',
        exitCode: StatusCode,
        durationMs,
      };
    } catch (err) {
      if (err instanceof UapSandboxError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new UapSandboxError(`Sandbox execution failed: ${message}`);
    }
  }

  async teardown(sandboxId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(sandboxId);
      await container.remove({ force: true });
    } catch (err) {
      // silently ignore not-found or other errors
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
