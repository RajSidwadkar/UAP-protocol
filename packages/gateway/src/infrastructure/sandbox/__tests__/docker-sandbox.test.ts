import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { DockerSandboxAdapter } from '../docker-sandbox-adapter';
import { UapSandboxError, UapValidationError } from '../../../domain/errors';
import { EventEmitter } from 'events';

const { mockExec, mockContainer } = vi.hoisted(() => {
  const mExec = {
    start: vi.fn().mockImplementation(() => {
      const stream = new EventEmitter();
      setTimeout(() => stream.emit('end'), 10);
      return Promise.resolve(stream);
    }),
    inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
  };

  const mContainer = {
    id: 'test-container-id',
    start: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
    exec: vi.fn().mockResolvedValue(mExec),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  return { mockExec: mExec, mockContainer: mContainer };
});

vi.mock('dockerode', () => {
  function DockerMock() {}
  DockerMock.prototype.createContainer = vi.fn().mockResolvedValue(mockContainer);
  DockerMock.prototype.getContainer = vi.fn().mockReturnValue(mockContainer);
  DockerMock.prototype.modem = {
    demuxStream: vi.fn().mockImplementation((stream, stdout, _stderr) => {
      stream.on('end', () => {
        stdout.write(Buffer.from('{"result":"ok"}'));
      });
    }),
  };
  
  return {
    default: DockerMock,
  };
});

interface MockDocker {
  createContainer: Mock;
  getContainer: Mock;
  modem: { demuxStream: Mock };
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
    vi.mocked(mockExec.inspect).mockResolvedValueOnce({ ExitCode: 1 });

    await expect(adapter.execute('fail-tool', {}, []))
      .rejects.toThrow(UapSandboxError);
  });

  it('should apply NetworkDisabled: true when network:egress scope is missing', async () => {
    await adapter.execute('test-tool', {}, []);
    
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    expect(DockerMock.prototype.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ NetworkDisabled: true })
    );
  });

  it('should apply NetworkDisabled: false when network:egress scope is present', async () => {
    await adapter.execute('test-tool', {}, ['network:egress']);
    
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    expect(DockerMock.prototype.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ NetworkDisabled: false })
    );
  });

  it('should always include CapDrop: ["ALL"] in HostConfig', async () => {
    await adapter.execute('test-tool', {}, ['net:bind', 'sys:time']);
    
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    expect(DockerMock.prototype.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({ CapDrop: ['ALL'] })
      })
    );
  });

  it('warm pool preserves containers and uses exec for varying tools', async () => {
    const DockerMock = (await import('dockerode')).default as unknown as MockDockerConstructor;
    const createContainerSpy = DockerMock.prototype.createContainer;
    const execSpy = mockContainer.exec;

    // First call: pool is empty, should call createContainer
    await adapter.execute('tool-1', { a: 1 }, []);
    expect(createContainerSpy).toHaveBeenCalledTimes(1);
    expect(execSpy).toHaveBeenCalledWith(expect.objectContaining({
      Cmd: expect.arrayContaining(['tool-1'])
    }));

    // Second call: pooled container is used, should NOT call createContainer again, but SHOULD call exec with new tool
    await adapter.execute('tool-2', { b: 2 }, []);
    expect(createContainerSpy).toHaveBeenCalledTimes(1); // Still 1
    expect(execSpy).toHaveBeenCalledWith(expect.objectContaining({
      Cmd: expect.arrayContaining(['tool-2'])
    }));
  });

  it('execute() with toolId \'../etc/passwd\' → throws UapValidationError', async () => {
    await expect(adapter.execute('../etc/passwd', {}, [])).rejects.toThrow(UapValidationError);
  });

  it('pool.drainPool() removes containers', async () => {
    // Manually add to pool for test
    const adapterWithPool = adapter as unknown as { pool: { available: unknown[] } };
    adapterWithPool.pool.available.push(mockContainer);
    
    await adapter.drainPool();
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
  });
});
