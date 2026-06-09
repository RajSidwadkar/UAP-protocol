import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';

const privKey = randomBytes(32);
const pubKey = ed25519.getPublicKey(privKey);

mkdirSync('config', { recursive: true });
writeFileSync('config/dev.privkey.hex', Buffer.from(privKey).toString('hex'));
writeFileSync('config/dev.pubkey.hex', Buffer.from(pubKey).toString('hex'));

console.log('✓ Ed25519 keypair written to config/');
console.log('  privkey: config/dev.privkey.hex');
console.log('  pubkey:  config/dev.pubkey.hex');
console.log('  ⚠  These files are gitignored. Keep them safe.');
