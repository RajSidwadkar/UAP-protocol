import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpBridgeAdapter } from '../../bridges/mcp-bridge.js';
import { program } from '../migrate.js';

// We need to mock McpBridgeAdapter to avoid actual server connections
vi.mock('../../bridges/mcp-bridge.js', () => {
  return {
    McpBridgeAdapter: vi.fn().mockImplementation((options) => {
      return {
        buildCapabilityCard: vi.fn().mockResolvedValue({
          issuer: options.issuerDid,
          version: '1.0.0',
          tools: [],
          scopes: [],
          issuedAt: 0,
          expiresAt: 9999999999999,
          signature: 'ed25519:aabbcc'
        }),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
    })
  };
});

class ExitError extends Error {
  constructor(public code: number) {
    super(`Process exited with code ${code}`);
  }
}

describe('uap-migrate CLI', () => {
  let tempDir: string;
  let keyPath: string;
  const privKeyHex = '0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uap-migrate-test-'));
    keyPath = path.join(tempDir, 'test.key');
    fs.writeFileSync(keyPath, privKeyHex);
    vi.clearAllMocks();
    
    // Configure program to not exit on error for testing
    program.exitOverride((err) => {
      throw new ExitError((err as any).exitCode || 1);
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('migrate mcp — first run writes card JSON to output directory', async () => {
    const outDir = path.join(tempDir, 'uap-cards');
    const issuer = 'test-agent'; // Avoid colons on Windows
    const args = ['node', 'migrate.js', 'mcp', 'http://localhost:8080', '--issuer', issuer, '--key', keyPath, '--out', outDir];
    
    // Mock process.exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new ExitError(code);
    }) as any);
    
    await program.parseAsync(args);
    
    const outputPath = path.join(outDir, `${issuer}.card.json`);
    expect(fs.existsSync(outputPath), `File ${outputPath} should exist`).toBe(true);
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(content.issuer).toBe(issuer);
    expect(content.signature).toBe('ed25519:aabbcc');
    
    exitSpy.mockRestore();
  });

  it('migrate mcp — second run on same output is a no-op (idempotent)', async () => {
    const outDir = path.join(tempDir, 'uap-cards');
    const issuer = 'test-agent';
    const outputPath = path.join(outDir, `${issuer}.card.json`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ issuer: 'existing' }));

    const args = ['node', 'migrate.js', 'mcp', 'http://localhost:8080', '--issuer', issuer, '--key', keyPath, '--out', outDir];
    
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new ExitError(code);
    }) as any);
    
    try {
      await program.parseAsync(args);
    } catch (e) {
      if (!(e instanceof ExitError) || e.code !== 0) throw e;
    }

    // McpBridgeAdapter should NOT have been instantiated or called
    expect(McpBridgeAdapter).not.toHaveBeenCalled();
    
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(content.issuer).toBe('existing'); // Content not changed
    
    exitSpy.mockRestore();
  });

  it('migrate mcp — missing --key option exits with error', async () => {
    const outDir = path.join(tempDir, 'uap-cards');
    const issuer = 'test-agent';
    const args = ['node', 'migrate.js', 'mcp', 'http://localhost:8080', '--issuer', issuer, '--out', outDir];
    
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new ExitError(code);
    }) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(program.parseAsync(args)).rejects.toThrow(ExitError);
    
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
