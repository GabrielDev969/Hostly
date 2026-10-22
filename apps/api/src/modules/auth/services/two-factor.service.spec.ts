import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  const service = new TwoFactorService();

  describe('TOTP', () => {
    it('verifies a token generated from the same secret', () => {
      const secret = service.generateSecret();
      const token = service.generateToken(secret);

      expect(service.verifyToken(secret, token)).toBe(true);
    });

    it('rejects an invalid token', () => {
      const secret = service.generateSecret();

      expect(service.verifyToken(secret, '000000')).toBe(false);
    });

    it('rejects non-numeric input', () => {
      const secret = service.generateSecret();

      expect(service.verifyToken(secret, 'abcdef')).toBe(false);
    });

    it('builds an otpauth URL with issuer and label', () => {
      const url = service.buildOtpAuthUrl('user@example.com', 'JBSWY3DPEHPK3PXP');

      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain('user%40example.com');
      expect(url).toContain('Workspace%20API');
      expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    });
  });

  describe('encryption', () => {
    it('round-trips a secret through encrypt/decrypt', () => {
      const secret = service.generateSecret();
      const encrypted = service.encryptSecret(secret);
      const decrypted = service.decryptSecret(encrypted);

      expect(encrypted).not.toBe(secret);
      expect(decrypted).toBe(secret);
    });
  });

  describe('recovery codes', () => {
    it('generates 10 unique XXXXX-XXXXX codes', () => {
      const codes = service.generateRecoveryCodes();

      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      codes.forEach((c) => expect(c).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/));
    });

    it('consumes a valid recovery code and removes it from storage', () => {
      const codes = service.generateRecoveryCodes();
      const stored = service.hashRecoveryCodes(codes);

      const remaining = service.consumeRecoveryCode(stored, codes[0]!);

      expect(remaining).not.toBeNull();
      expect(remaining).not.toContain(codes[0]);
      expect(JSON.parse(remaining!)).toHaveLength(9);
    });

    it('returns null for an unknown recovery code', () => {
      const codes = service.generateRecoveryCodes();
      const stored = service.hashRecoveryCodes(codes);

      expect(service.consumeRecoveryCode(stored, 'AAAAA-BBBBB')).toBeNull();
    });

    it('returns null when no codes are stored', () => {
      expect(service.consumeRecoveryCode(null, 'AAAAA-BBBBB')).toBeNull();
    });
  });
});
