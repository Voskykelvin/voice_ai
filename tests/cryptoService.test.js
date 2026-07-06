describe('cryptoService', () => {
  beforeEach(() => {
    process.env.MEMORY_ENCRYPTION_KEY = 'test-secret-that-is-long-enough-for-keying';
  });

  it('encrypts and decrypts text', () => {
    const { encryptText, decryptText } = require('../src/services/cryptoService');
    const encrypted = encryptText('I like late night talks.');

    expect(encrypted.encryptedContent).not.toContain('late night');
    expect(decryptText(encrypted)).toBe('I like late night talks.');
  });

  it('fails with the wrong key', () => {
    const { encryptText, decryptText } = require('../src/services/cryptoService');
    const encrypted = encryptText('secret');
    process.env.MEMORY_ENCRYPTION_KEY = 'different-secret-that-is-also-long-enough';

    expect(() => decryptText(encrypted)).toThrow();
  });
});
