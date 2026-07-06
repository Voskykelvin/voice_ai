const crypto = require('crypto');

function getEncryptionKey() {
  const raw = process.env.MEMORY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('MEMORY_ENCRYPTION_KEY is required for encrypted storage.');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const maybeBase64 = Buffer.from(raw, 'base64');
  if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
    return maybeBase64;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

function encryptText(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encryptedContent: encrypted.toString('base64'),
    contentIv: iv.toString('base64'),
    contentTag: tag.toString('base64'),
  };
}

function decryptText(record) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.contentIv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.contentTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.encryptedContent, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function stableContentHash(plainText) {
  return crypto
    .createHmac('sha256', getEncryptionKey())
    .update(String(plainText).trim())
    .digest('hex');
}

module.exports = {
  encryptText,
  decryptText,
  stableContentHash,
};
