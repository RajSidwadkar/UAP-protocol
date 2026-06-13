import { CapabilityCard, ICardSignerPort } from '../../domain/capability-card';

// 1. Define a local interface for the exact functions we need from @noble/curves
// This completely stops TypeScript from trying to resolve the ESM file for types.
interface Ed25519SignerTools {
  getPublicKey(privateKey: Uint8Array): Uint8Array;
  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
}

export class Ed25519SignerAdapter implements ICardSignerPort {
  private readonly privKey: Buffer;
  private pubKey?: Uint8Array; 
  
  // 2. Use our safe local interface here instead of 'typeof import(...)'
  private ed25519Module?: Ed25519SignerTools;

  constructor(privateKeyHex: string) {
    this.privKey = Buffer.from(privateKeyHex.trim(), 'hex');
  }

  private async getEd25519() {
    if (!this.ed25519Module) {
      // The runtime dynamic import remains untouched (CommonJS allows this)
      const { ed25519 } = await import('@noble/curves/ed25519');
      this.ed25519Module = ed25519;
      
      this.pubKey = ed25519.getPublicKey(
        new Uint8Array(this.privKey.buffer as ArrayBuffer, this.privKey.byteOffset, this.privKey.byteLength)
      );
    }
    
    return { ed25519: this.ed25519Module, pubKey: this.pubKey! };
  }

  async sign(card: Omit<CapabilityCard, 'signature'>): Promise<CapabilityCard> {
    const { ed25519 } = await this.getEd25519();
    
    const canonicalJson = this.getCanonicalJson(card);
    const payload = Buffer.from(canonicalJson);
    const sig = ed25519.sign(
      new Uint8Array(payload.buffer as ArrayBuffer, payload.byteOffset, payload.byteLength),
      new Uint8Array(this.privKey.buffer as ArrayBuffer, this.privKey.byteOffset, this.privKey.byteLength)
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

    const { ed25519, pubKey } = await this.getEd25519();
    
    const { signature, ...rest } = card;
    const sigHex = signature.slice(8);
    
    try {
      const sig = Buffer.from(sigHex, 'hex');
      const canonicalJson = this.getCanonicalJson(rest);
      const payload = Buffer.from(canonicalJson);
      
      return ed25519.verify(
        new Uint8Array(sig.buffer as ArrayBuffer, sig.byteOffset, sig.byteLength),
        new Uint8Array(payload.buffer as ArrayBuffer, payload.byteOffset, payload.byteLength),
        pubKey
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