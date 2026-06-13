import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { DockerSandboxAdapter } from '../docker-sandbox-adapter';
import { UapSandboxError, UapValidationError } from '../../../domain/errors';

vi.mock('dockerode', () => {
  const mockContainer = {
    start: vi.fn().mockResolvedValue(undefined),
    logs: vi.fn().mockResolvedValue(Buffer.from('{"result":"ok"}')),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  
  function DockerMock() {}
  DockerMock.prototype.createContainer = vi.fn().mockResolvedValue(mockContainer);
  DockerMock.prototype.getContainer = vi.fn().mockReturnValue(mockContainer);
  
  return {
    default: DockerMock,
  };
});

interface MockDocker {
  createContainer: Mock;
  getContainer: Mock;
}

interface MockDockerConstructor {
  new (): MockDocker;
}

describe('DockerSandboxAdapter', () => {
  let adapter: DockerSandboxAdapter;
  const socketPath = '/var/run/docker.sock';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DockerSandboxAdapter(socketPath);
  });

  it('should return SandboxResult on successful execution (exitCode 0)', async () => {
    const result = await adapter.execute('test-tool', { data: 1 }, []);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('{"result":"ok"}');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should throw UapSandboxError when tool exits with non-zero code', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    const mockContainer = await mockDockerInstance.createContainer();
    vi.mocked(mockContainer.wait).mockResolvedValueOnce({ StatusCode: 1 });

    await expect(adapter.execute('fail-tool', {}, []))
      .rejects.toThrow(UapSandboxError);
  });

  it('should apply NetworkDisabled: true when network:egress scope is missing', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    
    await adapter.execute('test-tool', {}, []);
    
    expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ NetworkDisabled: true })
    );
  });

  it('should apply NetworkDisabled: false when network:egress scope is present', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    
    await adapter.execute('test-tool', {}, ['network:egress']);
    
    expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ NetworkDisabled: false })
    );
  });

  it('should apply ReadonlyRootfs: true in HostConfig when fs:write scope is missing', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    
    await adapter.execute('test-tool', {}, []);
    
    expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({ ReadonlyRootfs: true })
      })
    );
  });

  it('should always include CapDrop: ["ALL"] in HostConfig', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    
    await adapter.execute('test-tool', {}, ['net:bind', 'sys:time']);
    
    expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({ CapDrop: ['ALL'] })
      })
    );
  });

  it('should call container.remove with { force: true } during teardown', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    const mockContainer = mockDockerInstance.getContainer('id');
    
    await adapter.teardown('id');
    
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
  });

  it('should silently swallow errors during teardown', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const mockDockerInstance = new DockerMock();
    const mockContainer = mockDockerInstance.getContainer('id');
    vi.mocked(mockContainer.remove).mockRejectedValueOnce(new Error('not found'));
    
    await expect(adapter.teardown('id')).resolves.toBeUndefined();
  });

  it('execute() with toolId \'db:query\' → does NOT throw (valid)', async () => {
    await expect(adapter.execute('db:query', {}, [])).resolves.toBeDefined();
  });

  it('execute() with toolId \'my-tool_v2\' → does NOT throw (valid)', async () => {
    await expect(adapter.execute('my-tool_v2', {}, [])).resolves.toBeDefined();
  });

  it('execute() with toolId \'../etc/passwd\' → throws UapValidationError', async () => {
    await expect(adapter.execute('../etc/passwd', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('execute() with toolId \'tool/hack\' → throws UapValidationError', async () => {
    await expect(adapter.execute('tool/hack', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('execute() with toolId \'tool hack\' (space) → throws UapValidationError', async () => {
    await expect(adapter.execute('tool hack', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('execute() with toolId longer than 128 chars → throws UapValidationError', async () => {
    const longId = 'a'.repeat(129);
    await expect(adapter.execute(longId, {}, [])).rejects.toThrow(UapValidationError);
  });

  it('execute() with toolId \'$()\' → throws UapValidationError', async () => {
    await expect(adapter.execute('$()', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('execute() with toolId \'..\\\\windows\\\\system32\' → throws UapValidationError', async () => {
    await expect(adapter.execute('..\\windows\\system32', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('pool.acquire() returns a warm container → createContainer NOT called on second request', async () => {
    const DockerMock = (await import('dockerode')).default as any;
    const createContainerSpy = DockerMock.prototype.createContainer;

    // First call: pool is empty, should call createContainer
    await adapter.execute('test-tool', {}, []);
    expect(createContainerSpy).toHaveBeenCalledTimes(1);

    // Second call: pool should have the container from first call
    await adapter.execute('test-tool', {}, []);
    expect(createContainerSpy).toHaveBeenCalledTimes(1); // Still 1
  });

  it('pool.release() is called after execution → pool.drainPool() removes containers', async () => {
    const DockerMock = (await import('dockerode')).default as any;
    const mockDockerInstance = new DockerMock();
    const mockContainer = await mockDockerInstance.createContainer();

    await adapter.execute('test-tool', {}, []);
    // Container should be in pool now
    
    await adapter.drainPool();
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
  });
});
