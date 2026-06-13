#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { McpBridgeAdapter } from '../bridges/mcp-bridge.js';
import { A2aBridgeAdapter, A2aAgentCard } from '../bridges/a2a-bridge.js';
import { Ed25519SignerAdapter } from '../infrastructure/signing/ed25519-signer.js';

class MigrationError extends Error {
  readonly code = 'UAP_MIGRATION_ERROR';
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export const program = new Command();

program
  .name('uap-migrate')
  .description('UAP protocol migration tool')
  .version('0.1.0');

function logStderr(event: string, source: string, toolCount: number, outputPath: string, error?: string) {
  console.error(JSON.stringify({
    event,
    source,
    toolCount,
    outputPath,
    error,
  }));
}

async function ensureSigner(keyPath: string): Promise<Ed25519SignerAdapter> {
  try {
    const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
    return new Ed25519SignerAdapter(keyHex);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new MigrationError(`Failed to read key from ${keyPath}: ${errorMessage}`);
  }
}

program
  .command('mcp')
  .argument('<server-url>', 'MCP server URL')
  .option('--issuer <did>', 'Issuer DID', 'did:uap:default')
  .requiredOption('--key <path>', 'Path to Ed25519 private key hex file')
  .option('--out <path>', 'Output directory', './uap-cards')
  .action(async (serverUrl, options) => {
    const outDir = path.resolve(options.out);
    const outputPath = path.join(outDir, `${options.issuer}.card.json`);

    if (fs.existsSync(outputPath)) {
      logStderr('MIGRATION_SKIPPED', serverUrl, 0, outputPath);
      process.exit(0);
    }

    try {
      const signer = await ensureSigner(options.key);
      const bridge = new McpBridgeAdapter({
        mcpServerUrl: serverUrl,
        signer,
        issuerDid: options.issuer,
      });

      const card = await bridge.buildCapabilityCard();
      
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(card, null, 2));
      logStderr('MIGRATION_COMPLETED', serverUrl, card.tools.length, outputPath);
      
      // MCP bridge keeps connection open, need to disconnect
      await bridge.disconnect();
    } catch (err) {
      if (err instanceof MigrationError) {
        process.stderr.write(
          JSON.stringify({ event: 'MIGRATION_FAILED', error: err.message }) + '\n'
        );
        process.exit(1);
      }
      // Re-throw unexpected errors
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        JSON.stringify({ event: 'MIGRATION_FAILED', error: msg }) + '\n'
      );
      process.exit(1);
    }
  });

program
  .command('a2a')
  .argument('<card-json-path>', 'A2A JSON card path')
  .option('--issuer <did>', 'Issuer DID', 'did:uap:default')
  .requiredOption('--key <path>', 'Path to Ed25519 private key hex file')
  .option('--out <path>', 'Output directory', './uap-cards')
  .action(async (jsonPath, options) => {
    const outDir = path.resolve(options.out);
    const outputPath = path.join(outDir, `${options.issuer}.card.json`);

    if (fs.existsSync(outputPath)) {
      logStderr('MIGRATION_SKIPPED', jsonPath, 0, outputPath);
      process.exit(0);
    }

    try {
      const signer = await ensureSigner(options.key);
      const bridge = new A2aBridgeAdapter(signer);

      const a2aCard = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as A2aAgentCard;
      // If issuer DID is provided, we should probably use it, but A2A uses a2aCard.name as issuer.
      // The prompt says convertAgentCard(a2aCard) which uses a2aCard.name for issuer.
      // If user provided --issuer, maybe we should override? 
      // Prompt says: "issuer: a2aCard.name". I'll follow that.
      
      const card = await bridge.convertAgentCard(a2aCard);
      
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const finalOutputPath = path.join(outDir, `${card.issuer}.card.json`);
      fs.writeFileSync(finalOutputPath, JSON.stringify(card, null, 2));
      logStderr('MIGRATION_COMPLETED', jsonPath, card.tools.length, finalOutputPath);
    } catch (err) {
      if (err instanceof MigrationError) {
        process.stderr.write(
          JSON.stringify({ event: 'MIGRATION_FAILED', error: err.message }) + '\n'
        );
        process.exit(1);
      }
      // Re-throw unexpected errors
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        JSON.stringify({ event: 'MIGRATION_FAILED', error: msg }) + '\n'
      );
      process.exit(1);
    }
  });

// Only run automatically if this file is the main entry point
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file:///', '').replace('file://', '')) ||
  path.resolve(process.argv[1]) === path.resolve(process.cwd(), 'src/cli/migrate.ts')
);

if (isMain) {
  program.parseAsync(process.argv);
}
