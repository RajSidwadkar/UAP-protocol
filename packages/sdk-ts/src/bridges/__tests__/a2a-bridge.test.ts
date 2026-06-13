import { describe, it, expect, beforeEach } from 'vitest';
import { A2aBridgeAdapter, A2aAgentCard } from '../a2a-bridge.js';
import { Ed25519SignerAdapter } from '../../infrastructure/signing/ed25519-signer.js';

describe('A2aBridgeAdapter', () => {
  let signer: Ed25519SignerAdapter;
  let adapter: A2aBridgeAdapter;
  const privKeyHex = '0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(() => {
    signer = new Ed25519SignerAdapter(privKeyHex);
    adapter = new A2aBridgeAdapter(signer);
  });

  it('convertAgentCard() -> output card.tools contains all skills mapped correctly', async () => {
    const a2aCard: A2aAgentCard = {
      name: 'agent-1',
      skills: [
        {
          id: 'skill-1',
          description: 'desc-1',
          inputModes: [{ type: 'object', properties: { p1: { type: 'string' } } }],
        },
      ],
    };

    const card = await adapter.convertAgentCard(a2aCard);
    expect(card.tools).toHaveLength(1);
    expect(card.tools[0]?.id).toBe('skill-1');
    expect(card.tools[0]?.description).toBe('desc-1');
    expect(card.tools[0]?.inputSchema).toEqual({ type: 'object', properties: { p1: { type: 'string' } } });
    expect(card.tools[0]?.scopes).toEqual(['task:submit', 'task:read']);
  });

  it('convertAgentCard() -> card.signature is valid', async () => {
    const a2aCard: A2aAgentCard = { name: 'agent-1' };
    const card = await adapter.convertAgentCard(a2aCard);
    
    const isValid = await signer.verify(card);
    expect(isValid).toBe(true);
  });

  it('convertAgentCard() with no skills (skills: []) -> empty tools[], still signed', async () => {
    const a2aCard: A2aAgentCard = { name: 'agent-1', skills: [] };
    const card = await adapter.convertAgentCard(a2aCard);
    
    expect(card.tools).toHaveLength(0);
    expect(card.signature).toBeDefined();
    const isValid = await signer.verify(card);
    expect(isValid).toBe(true);
  });

  it('convertAgentCard() -> card.issuer equals a2aCard.name', async () => {
    const a2aCard: A2aAgentCard = { name: 'agent-1' };
    const card = await adapter.convertAgentCard(a2aCard);
    
    expect(card.issuer).toBe('agent-1');
  });

  it('convertAgentCard() — A2A card with zero skills produces empty tools array and valid signature', async () => {
    const a2aCard: A2aAgentCard = { name: 'empty-agent', version: '1.0.0', skills: [] };
    const card = await adapter.convertAgentCard(a2aCard);
    
    expect(card.tools).toEqual([]);
    expect(card.signature?.startsWith('ed25519:')).toBe(true);
    
    const isValid = await signer.verify(card);
    expect(isValid).toBe(true);
  });
});
