import { encrypt, decrypt, getEncryptionKey } from './crypto.util';

describe('crypto.util', () => {
  const secret = 'test-secret-key-32-characters!!';

  describe('encrypt / decrypt round-trip', () => {
    it('decrypts back to the original plaintext', () => {
      const plaintext = 'super-secret-postgres-password';
      const ciphertext = encrypt(plaintext, secret);
      expect(decrypt(ciphertext, secret)).toBe(plaintext);
    });

    it('produces a different ciphertext each time (random IV)', () => {
      const plaintext = 'same-password';
      const a = encrypt(plaintext, secret);
      const b = encrypt(plaintext, secret);
      expect(a).not.toBe(b);
      // Lekin ikkalasi ham to'g'ri dekodlanishi kerak
      expect(decrypt(a, secret)).toBe(plaintext);
      expect(decrypt(b, secret)).toBe(plaintext);
    });

    it('handles empty string', () => {
      const ciphertext = encrypt('', secret);
      expect(decrypt(ciphertext, secret)).toBe('');
    });

    it('handles unicode characters', () => {
      const plaintext = "parol_bilan_o'zbekcha_🔒";
      const ciphertext = encrypt(plaintext, secret);
      expect(decrypt(ciphertext, secret)).toBe(plaintext);
    });

    it('produces the iv:tag:ciphertext hex format', () => {
      const ciphertext = encrypt('test', secret);
      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 16 byte IV
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16 byte auth tag
    });
  });

  describe('wrong key / tampering', () => {
    it('throws when decrypting with the wrong key', () => {
      const ciphertext = encrypt('secret', secret);
      expect(() =>
        decrypt(ciphertext, 'a-completely-different-key-here'),
      ).toThrow();
    });

    it('throws when the ciphertext has been tampered with', () => {
      const ciphertext = encrypt('secret', secret);
      const [iv, tag, data] = ciphertext.split(':');
      const tamperedChar = data[0] === 'a' ? 'b' : 'a';
      const tampered = `${iv}:${tag}:${tamperedChar}${data.slice(1)}`;
      expect(() => decrypt(tampered, secret)).toThrow();
    });

    it('throws on malformed ciphertext format', () => {
      expect(() => decrypt('not-a-valid-format', secret)).toThrow(
        'Invalid encrypted format',
      );
    });
  });

  describe('getEncryptionKey', () => {
    const original = process.env.ENCRYPTION_KEY;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.ENCRYPTION_KEY = original;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('returns the env value when set', () => {
      process.env.ENCRYPTION_KEY = 'my-real-key';
      expect(getEncryptionKey()).toBe('my-real-key');
    });

    it('falls back to the default key outside production', () => {
      delete process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'development';
      expect(getEncryptionKey()).toBe('default-dev-key-change-in-production');
    });

    it('refuses to start with the default key in production', () => {
      delete process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY must be set/);
    });
  });
});
