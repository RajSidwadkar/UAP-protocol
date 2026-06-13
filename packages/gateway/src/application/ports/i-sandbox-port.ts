import { PermissionScope } from '../../domain/capability-card';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ISandboxPort {
  execute(toolId: string, input: unknown, scope: PermissionScope[]): Promise<SandboxResult>;
  /**
   * Explicit teardown for non-pooled or error-recovery scenarios.
   * In pooled deployments, cleanup is handled internally by the
   * adapter via pool.release(). Callers are not required to invoke
   * this method when using a pooled ISandboxPort implementation.
   */
  teardown(sandboxId: string): Promise<void>;
}
