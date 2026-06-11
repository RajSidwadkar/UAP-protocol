import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadTlsOptions, buildGateway } from '../fastify-gateway';
import { readFileSync } from 'fs';
import Fastify from 'fastify';
import { AppContainer } from '../../infrastructure/composition-root';

vi.mock('fs');
vi.mock('fastify', () => {
  const mockFastify = {
    register: vi.fn().mockReturnThis(),
    setErrorHandler: vi.fn().mockReturnThis(),
  };
  return {
    default: vi.fn(() => mockFastify),
  };
});

describe('TLS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('loadTlsOptions() throws Error when UAP_MTLS_CERT is missing from process.env', () => {
    delete process.env.UAP_MTLS_CERT;
    process.env.UAP_MTLS_KEY = 'some/path';
    expect(() => loadTlsOptions()).toThrow('UAP_MTLS_CERT and UAP_MTLS_KEY are required. Plaintext HTTP is forbidden in UAP.');
  });

  it('loadTlsOptions() throws Error when UAP_MTLS_KEY is missing from process.env', () => {
    process.env.UAP_MTLS_CERT = 'some/path';
    delete process.env.UAP_MTLS_KEY;
    expect(() => loadTlsOptions()).toThrow('UAP_MTLS_CERT and UAP_MTLS_KEY are required. Plaintext HTTP is forbidden in UAP.');
  });

  it('loadTlsOptions() returns object with key and cert when both env vars point to real files', () => {
    process.env.UAP_MTLS_CERT = 'cert.pem';
    process.env.UAP_MTLS_KEY = 'key.pem';
    
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('MOCK_CERT'));

    const options = loadTlsOptions();
    expect(options.cert).toEqual(Buffer.from('MOCK_CERT'));
    expect(options.key).toEqual(Buffer.from('MOCK_CERT'));
    expect(readFileSync).toHaveBeenCalledWith('cert.pem');
    expect(readFileSync).toHaveBeenCalledWith('key.pem');
  });

  it('loadTlsOptions() sets requestCert: false and rejectUnauthorized: false when UAP_MTLS_CA is absent', () => {
    process.env.UAP_MTLS_CERT = 'cert.pem';
    process.env.UAP_MTLS_KEY = 'key.pem';
    delete process.env.UAP_MTLS_CA;

    vi.mocked(readFileSync).mockReturnValue(Buffer.from('MOCK_DATA'));

    const options = loadTlsOptions();
    expect(options.requestCert).toBe(false);
    expect(options.rejectUnauthorized).toBe(false);
    expect(options.ca).toBeUndefined();
  });

  it('loadTlsOptions() sets requestCert: true and rejectUnauthorized: true when UAP_MTLS_CA is present', () => {
    process.env.UAP_MTLS_CERT = 'cert.pem';
    process.env.UAP_MTLS_KEY = 'key.pem';
    process.env.UAP_MTLS_CA = 'ca.pem';

    vi.mocked(readFileSync).mockReturnValue(Buffer.from('MOCK_DATA'));

    const options = loadTlsOptions();
    expect(options.requestCert).toBe(true);
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.ca).toEqual(Buffer.from('MOCK_DATA'));
    expect(readFileSync).toHaveBeenCalledWith('ca.pem');
  });

  it('buildGateway() calls loadTlsOptions() and passes options to Fastify', async () => {
    process.env.UAP_MTLS_CERT = 'cert.pem';
    process.env.UAP_MTLS_KEY = 'key.pem';
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('MOCK_DATA'));

    const mockContainer = {
      audit: { publish: vi.fn() }
    } as unknown as AppContainer;

    await buildGateway(mockContainer);
    
    expect(Fastify).toHaveBeenCalledWith(expect.objectContaining({
      https: expect.objectContaining({
        cert: Buffer.from('MOCK_DATA'),
        key: Buffer.from('MOCK_DATA')
      })
    }));
  });
});
