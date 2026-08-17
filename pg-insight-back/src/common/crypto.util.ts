import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'pg-insight-salt', 32) as Buffer;
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string, secret: string): string {
  const parts = ciphertext.split(':');
  const [ivHex, tagHex, dataHex] = parts;

  if (parts.length !== 3 || !ivHex || !tagHex || dataHex === undefined) {
    throw new Error('Invalid encrypted format — expected iv:tag:ciphertext');
  }

  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return decrypted.toString('utf8');
}

export function getEncryptionKey(): string {
  const key =
    process.env.ENCRYPTION_KEY ?? 'default-dev-key-change-in-production';
  if (
    key === 'default-dev-key-change-in-production' &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'ENCRYPTION_KEY must be set to a real secret in production — refusing to start with the default key',
    );
  }
  return key;
}
