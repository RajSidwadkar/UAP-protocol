import { PermissionScope } from '../../domain/capability-card';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ISandboxPort {
  execute(toolId: string, input: unknown, scope: PermissionScope[]): Promise<SandboxResult>;
  teardown(sandboxId: string): Promise<void>;
}
