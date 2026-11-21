import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, sha256 } from '@/lib/crypto';

describe('crypto', () => {
  it('round-trips an AES-256-GCM encrypted secret', () => {
    const secret = 'sk-live-test-1234567890abcdef';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces different ciphertexts for the same plaintext', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decryptSecret('garbage')).toThrow();
  });

  it('hashes deterministically', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).toHaveLength(64);
  });
});
