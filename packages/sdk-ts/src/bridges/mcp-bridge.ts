import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CapabilityCard, ICardSignerPort, ToolManifest } from '../domain/capability-card.js';

export class McpBridgeTimeoutError extends Error {
  readonly code = 'MCP_BRIDGE_TIMEOUT';
  constructor(label: string, ms: number) {
    super(`MCP operation '${label}' timed out after ${ms}ms`);
    this.name = 'McpBridgeTimeoutError';
  }
}

export interface McpBridgeOptions {
  mcpServerUrl: string;
  signer: ICardSignerPort;
  issuerDid: string;
}

export class McpBridgeAdapter {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(private options: McpBridgeOptions) {
    this.transport = new StdioClientTransport({
      command: options.mcpServerUrl,
    });
    this.client = new Client(
      { name: 'uap-bridge', version: '1.0.0' },
      { capabilities: {} }
    );
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new McpBridgeTimeoutError(label, ms));
      }, ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  async buildCapabilityCard(): Promise<CapabilityCard> {
    try {
      await this.withTimeout(this.client.connect(this.transport), 10_000, 'connect');
      const toolsResult = await this.withTimeout(this.client.listTools(), 15_000, 'listTools');
      const toolCount = toolsResult.tools.length;

      const tools: ToolManifest[] = toolsResult.tools.map((t) => ({
        id: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema as Record<string, unknown>,
        scopes: ['tool:read'],
      }));

      const unsignedCard: Omit<CapabilityCard, 'signature'> = {
        issuer: this.options.issuerDid,
        version: '1.0.0',
        tools,
        scopes: ['tool:read', 'tool:write'],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86_400_000 * 30,
      };

      const signedCard = await this.options.signer.sign(unsignedCard);

      console.info('MCP_BRIDGE_CONNECTED', {
        kind: 'MCP_BRIDGE_CONNECTED',
        issuerDid: this.options.issuerDid,
        toolCount,
      });

      return signedCard;
    } catch (err: unknown) {
      if (err instanceof McpBridgeTimeoutError) {
        console.warn({ kind: 'MCP_BRIDGE_ERROR', reason: 'timeout', message: err.message });
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn({
        kind: 'MCP_BRIDGE_ERROR',
        reason: 'error',
        message,
      });
      throw err;
    }
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const result = await this.withTimeout(
        this.client.callTool({
          name: toolName,
          arguments: args,
        }),
        30_000,
        'callTool'
      );

      console.info('MCP_TOOL_PROXIED', {
        kind: 'MCP_TOOL_PROXIED',
        toolName,
        traceId: undefined, // traceId not available in this scope
      });

      return result.content;
    } catch (err: unknown) {
      if (err instanceof McpBridgeTimeoutError) {
        console.warn({ kind: 'MCP_BRIDGE_ERROR', reason: 'timeout', message: err.message });
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn({
        kind: 'MCP_BRIDGE_ERROR',
        reason: 'error',
        message,
      });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}
