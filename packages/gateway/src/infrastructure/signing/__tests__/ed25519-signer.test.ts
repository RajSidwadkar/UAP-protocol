import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import { Ed25519SignerAdapter } from '../ed25519-signer';
import type { CapabilityCard } from '../../../domain/capability-card';

describe('Ed25519SignerAdapter', () => {
  let signer: Ed25519SignerAdapter;
  let privKeyHex: string;

  const sampleCard: Omit<CapabilityCard, 'signature'> = {
    issuer: 'did:uap:123',
    version: '1.0.0',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    scopes: ['tool:read'],
    tools: [
      {
        id: 'weather',
        description: 'Get weather info',
        inputSchema: { type: 'object' },
        scopes: ['tool:read'],
      },
    ],
  };

  beforeAll(() => {
    const privKey = randomBytes(32);
    privKeyHex = privKey.toString('hex');
    signer = new Ed25519SignerAdapter(privKeyHex);
  });

  it('1. sign() then verify() -> verify returns true (roundtrip)', async () => {
    const signedCard = await signer.sign(sampleCard);
    const isValid = await signer.verify(signedCard);
    expect(isValid).toBe(true);
  });

  it('2. Tamper: mutate one tool description after signing -> verify returns false', async () => {
    const signedCard = await signer.sign(sampleCard);
    const tamperedCard: CapabilityCard = {
      ...signedCard,
      tools: [
        {
          ...signedCard.tools[0]!,
          description: 'Tampered description',
        },
      ],
    };
    const isValid = await signer.verify(tamperedCard);
    expect(isValid).toBe(false);
  });

  it('3. Tamper: add a tool to card.tools after signing -> verify returns false', async () => {
    const signedCard = await signer.sign(sampleCard);
    const tamperedCard = {
      ...signedCard,
      tools: [
        ...signedCard.tools,
        {
          id: 'new-tool',
          description: 'New tool',
          inputSchema: {},
          scopes: [],
        },
      ],
    };
    const isValid = await signer.verify(tamperedCard);
    expect(isValid).toBe(false);
  });

  it('4. Tamper: change card.issuer after signing -> verify returns false', async () => {
    const signedCard = await signer.sign(sampleCard);
    const tamperedCard = {
      ...signedCard,
      issuer: 'did:uap:tampered',
    };
    const isValid = await signer.verify(tamperedCard);
    expect(isValid).toBe(false);
  });

  it('5. card.signature starts with "ed25519:"', async () => {
    const signedCard = await signer.sign(sampleCard);
    expect(signedCard.signature).toMatch(/^ed25519:[0-9a-f]{128}$/);
  });

  it('6. verify() with missing signature field -> returns false without throwing', async () => {
    const { signature: _, ...cardWithoutSignature } = await signer.sign(sampleCard);
    const isValid = await signer.verify(cardWithoutSignature as CapabilityCard);
    expect(isValid).toBe(false);
  });

  it('7. verify() with signature "rsa:..." prefix -> returns false without throwing', async () => {
    const signedCard = await signer.sign(sampleCard);
    const invalidPrefixCard = {
      ...signedCard,
      signature: signedCard.signature?.replace('ed25519:', 'rsa:'),
    };
    const isValid = await signer.verify(invalidPrefixCard as CapabilityCard);
    expect(isValid).toBe(false);
  });

  it('8. verify() with malformed hex in signature -> returns false without throwing', async () => {
    const signedCard = await signer.sign(sampleCard);
    const malformedHexCard = {
      ...signedCard,
      signature: 'ed25519:not-hex-at-all',
    };
    const isValid = await signer.verify(malformedHexCard);
    expect(isValid).toBe(false);
  });
});
