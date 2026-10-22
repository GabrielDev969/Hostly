import { CryptoUtil } from './crypto.util';

describe('CryptoUtil', () => {
  const key = '0'.repeat(64);

  it('round-trips plaintext through encrypt/decrypt and produces a different ciphertext each call', () => {
    const plaintext = 'super-secret-2fa-seed';

    const a = CryptoUtil.encrypt(plaintext, key);
    const b = CryptoUtil.encrypt(plaintext, key);

    expect(a).not.toBe(plaintext);
    expect(a).not.toBe(b);
    expect(CryptoUtil.decrypt(a, key)).toBe(plaintext);
    expect(CryptoUtil.decrypt(b, key)).toBe(plaintext);
  });

  it('hashes passwords with argon2id and verifies them', async () => {
    const hash = await CryptoUtil.hashPassword('Tr0ub4dor#Castle9!');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(CryptoUtil.verifyPassword(hash, 'Tr0ub4dor#Castle9!')).resolves.toBe(true);
    await expect(CryptoUtil.verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
    await expect(CryptoUtil.verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });
});
