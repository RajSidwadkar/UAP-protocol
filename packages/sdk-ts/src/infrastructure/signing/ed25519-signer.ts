import { ed25519 } from '@noble/curves/ed25519.js';
import { CapabilityCard, ICardSignerPort } from '../../domain/capability-card.js';

export class Ed25519SignerAdapter implements ICardSignerPort {
  private readonly privKey: Uint8Array;
  private readonly pubKey: Uint8Array;

  constructor(privateKeyHex: string) {
    const buf = Buffer.from(privateKeyHex.trim(), 'hex');
    this.privKey = new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
    this.pubKey = ed25519.getPublicKey(this.privKey);
  }

  async sign(card: Omit<CapabilityCard, 'signature'>): Promise<CapabilityCard> {
    const canonicalJson = this.getCanonicalJson(card);
    const payload = Buffer.from(canonicalJson);
    const sig = ed25519.sign(
      new Uint8Array(payload.buffer as ArrayBuffer, payload.byteOffset, payload.byteLength),
      this.privKey
    );
    
    return {
      ...card,
      signature: `ed25519:${Buffer.from(sig).toString('hex')}`,
    };
  }

  async verify(card: CapabilityCard): Promise<boolean> {
    if (!card.signature || !card.signature.startsWith('ed25519:')) {
      return false;
    }

    const { signature, ...rest } = card;
    const sigHex = signature.slice(8);
    
    try {
      const sig = Buffer.from(sigHex, 'hex');
      const canonicalJson = this.getCanonicalJson(rest);
      const payload = Buffer.from(canonicalJson);
      
      return ed25519.verify(
        new Uint8Array(sig.buffer as ArrayBuffer, sig.byteOffset, sig.byteLength),
        new Uint8Array(payload.buffer as ArrayBuffer, payload.byteOffset, payload.byteLength),
        this.pubKey
      );
    } catch {
      return false;
    }
  }

  private getCanonicalJson(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>).sort().reduce((acc, k) => {
          (acc as Record<string, unknown>)[k] = (value as Record<string, unknown>)[k];
          return acc;
        }, {});
      }
      return value;
    });
  }
}
