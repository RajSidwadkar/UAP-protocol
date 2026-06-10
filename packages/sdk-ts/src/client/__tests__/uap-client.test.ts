import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UapClient, UapClientError } from '../uap-client.js';
import { ITokenProvider } from '../i-token-provider.js';

describe('UapClient', () => {
  let client: UapClient;
  let mockTokenProvider: ITokenProvider;
  const gatewayUrl = 'http://gateway.local';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockTokenProvider = {
      getToken: vi.fn().mockResolvedValue('valid-token'),
      clearCache: vi.fn(),
    };
    client = new UapClient({
      gatewayUrl,
      tokenProvider: mockTokenProvider,
    });
  });

  it('invokeTool() -> POST body is a valid UapEnvelope', async () => {
    const mockFetch = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ result: 'ok' }),
    } as Response);

    await client.invokeTool('test-tool', { arg: 1 }, ['tool:read']);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${gatewayUrl}/tools/invoke`);
    const body = JSON.parse(options!.body as string);
    expect(body.uap.type).toBe('tool_call');
    expect(body.uap.trace.traceparent).toBeDefined();
    expect(body.method).toBe('tools/invoke');
    expect(body.params).toEqual({ arg: 1 });
  });

  it('invokeTool() -> Authorization header is "Bearer <token>"', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ result: 'ok' }),
    } as Response);

    await client.invokeTool('test-tool', {}, []);

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    expect((options!.headers as Record<string, string>).Authorization).toBe('Bearer valid-token');
  });

  it('invokeTool() -> traceparent is a valid W3C format string', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ result: 'ok' }),
    } as Response);

    await client.invokeTool('test-tool', {}, []);

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(options!.body as string);
    const traceparent = body.uap.trace.traceparent;
    expect(traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  });

  it('401 response -> tokenProvider.getToken called twice, second attempt succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => 'Unauthorized',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ result: 'ok' }),
      } as Response);

    await client.invokeTool('test-tool', {}, []);

    expect(mockTokenProvider.getToken).toHaveBeenCalledTimes(2);
    expect(mockTokenProvider.clearCache).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('401 on retry -> throws UapClientError(401)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(client.invokeTool('test-tool', {}, []))
      .rejects.toThrow(UapClientError);
    
    try {
      await client.invokeTool('test-tool', {}, []);
    } catch (err: unknown) {
      if (err instanceof UapClientError) {
        expect(err.statusCode).toBe(401);
      }
    }
  });

  it('500 response -> throws UapClientError(500) without retry', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 500,
      ok: false,
      text: async () => 'Internal Server Error',
    } as Response);

    await expect(client.invokeTool('test-tool', {}, []))
      .rejects.toThrow(UapClientError);

    expect(mockTokenProvider.getToken).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
