import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpBridgeAdapter, McpBridgeTimeoutError } from '../mcp-bridge.js';
import { ICardSignerPort } from '../../domain/capability-card.js';

const mockClientMethods = {
  connect: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({
    tools: [
      { name: 'test-tool', description: 'test description', inputSchema: {} }
    ]
  }),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'result' }]
  }),
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(function() {
      return mockClientMethods;
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: vi.fn().mockImplementation(function() {
      return {};
    }),
  };
});

describe('McpBridgeAdapter', () => {
  let adapter: McpBridgeAdapter;
  let mockSigner: ICardSignerPort;
  const issuerDid = 'did:uap:test';

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset mock methods to default behavior
    mockClientMethods.connect.mockResolvedValue(undefined);
    mockClientMethods.listTools.mockResolvedValue({
      tools: [
        { name: 'test-tool', description: 'test description', inputSchema: {} }
      ]
    });
    mockClientMethods.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'result' }]
    });

    mockSigner = {
      sign: vi.fn().mockImplementation(async (card) => ({
        ...card,
        signature: 'ed25519:mock-signature'
      })),
      verify: vi.fn().mockImplementation(async (card) => {
        // Simple mock verification logic for tamper test
        if (card.tools[0]?.description === 'tampered') return false;
        return card.signature === 'ed25519:mock-signature';
      }),
    };

    adapter = new McpBridgeAdapter({
      mcpServerUrl: 'mock-command',
      signer: mockSigner,
      issuerDid,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildCapabilityCard() -> card.tools contains all tools returned by listTools()', async () => {
    const card = await adapter.buildCapabilityCard();
    expect(card.tools).toHaveLength(1);
    expect(card.tools[0]?.id).toBe('test-tool');
  });

  it('buildCapabilityCard() -> card.signature starts with "ed25519:"', async () => {
    const card = await adapter.buildCapabilityCard();
    expect(card.signature).toBeDefined();
    expect(card.signature?.startsWith('ed25519:')).toBe(true);
  });

  it('buildCapabilityCard() -> mutating a tool description after signing makes verify() return false', async () => {
    const card = await adapter.buildCapabilityCard();
    
    // Mutate the tool description
    // @ts-expect-error - mutating readonly for test
    card.tools[0].description = 'tampered';
    
    const isValid = await mockSigner.verify(card);
    expect(isValid).toBe(false);
  });

  it('invokeTool() -> calls client.callTool with correct { name, arguments }', async () => {
    await adapter.invokeTool('test-tool', { arg: 1 });
    
    expect(mockClientMethods.callTool).toHaveBeenCalledWith({
      name: 'test-tool',
      arguments: { arg: 1 },
    });
  });

  it('invokeTool() -> returns result.content', async () => {
    const result = await adapter.invokeTool('test-tool', {});
    expect(result).toEqual([{ type: 'text', text: 'result' }]);
  });

  it('buildCapabilityCard() connection failure -> logs MCP_BRIDGE_ERROR, rethrows', async () => {
    mockClientMethods.connect.mockRejectedValueOnce(new Error('Connection failed'));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(adapter.buildCapabilityCard()).rejects.toThrow('Connection failed');
    expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'MCP_BRIDGE_ERROR',
      message: 'Connection failed'
    }));
    
    consoleSpy.mockRestore();
  });

  it('buildCapabilityCard() — MCP server connection failure emits MCP_BRIDGE_ERROR', async () => {
    mockClientMethods.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    await expect(adapter.buildCapabilityCard()).rejects.toThrow('ECONNREFUSED');
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'MCP_BRIDGE_ERROR',
      message: 'ECONNREFUSED'
    }));
    
    consoleSpy.mockRestore();
  });

  it('buildCapabilityCard() rejects and emits MCP_BRIDGE_ERROR when listTools() throws', async () => {
    // Arrange
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockClientMethods.connect.mockResolvedValue(undefined);
    mockClientMethods.listTools.mockRejectedValue(new Error('MCP server returned 500'));

    // Act + Assert
    await expect(adapter.buildCapabilityCard()).rejects.toThrow('MCP server returned 500');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'MCP_BRIDGE_ERROR' })
    );
    warnSpy.mockRestore();
  });

  it('buildCapabilityCard() rejects with McpBridgeTimeoutError when connect() hangs past 10s', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockClientMethods.connect.mockReturnValue(new Promise(() => {})); // never resolves

    const promise = adapter.buildCapabilityCard();
    vi.advanceTimersByTime(10_001);

    await expect(promise).rejects.toThrow('timed out');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'MCP_BRIDGE_ERROR', reason: 'timeout' })
    );
    warnSpy.mockRestore();
  });

  it('invokeTool() rejects with McpBridgeTimeoutError when callTool() hangs past 30s', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockClientMethods.callTool.mockReturnValue(new Promise(() => {})); // never resolves

    const promise = adapter.invokeTool('some-tool', {});
    vi.advanceTimersByTime(30_001);

    await expect(promise).rejects.toThrow('timed out');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'MCP_BRIDGE_ERROR' })
    );
    warnSpy.mockRestore();
  });
});
