import { ICryptoProvider } from '@private-vault/core';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from '@craftzdog/react-native-buffer';

// Helper: Uint8Array <-> hex string
function buf2hex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hex2buf(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map(b => parseInt(b, 16)));
}

// Mobile 使用 React Native 的 Crypto API (react-native-quick-crypto)
// 金鑰衍生使用標準 PBKDF2-HMAC-SHA512
export class MobileCryptoProvider implements ICryptoProvider {
  /**
   * PBKDF2 金鑰衍生
   */
  async deriveKey(masterPassword: string, saltHex?: string): Promise<{ key: Uint8Array; salt: string }> {
    const crypto = require('react-native-quick-crypto');
    
    let saltBytes: Uint8Array;
    if (saltHex) {
      saltBytes = hex2buf(saltHex);
    } else {
      saltBytes = new Uint8Array(crypto.randomBytes(16));
    }

    const saltHexStr = buf2hex(saltBytes);
    
    // 使用 PBKDF2 進行金鑰衍生 (100,000 次疊代)
    const key = crypto.pbkdf2Sync(
      masterPassword,
      Buffer.from(saltBytes),
      100000,
      32,
      'sha512'
    );

    return { key: new Uint8Array(key), salt: saltHexStr };
  }

  /**
   * AES-256-GCM 加密
   */
  async encryptData(plaintext: string, key: Uint8Array): Promise<{ iv: string; ciphertext: string; authTag: string }> {
    const crypto = require('react-native-quick-crypto');
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      iv: iv.toString('hex'),
      ciphertext: ciphertext,
      authTag: authTag,
    };
  }

  /**
   * AES-256-GCM 解密
   */
  async decryptData(payload: { iv: string; ciphertext: string; authTag: string }, key: Uint8Array): Promise<string> {
    if (!payload || !payload.iv || !payload.ciphertext) throw new Error('Invalid encrypted payload');
    
    const crypto = require('react-native-quick-crypto');
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.authTag || (payload as any).tag || '', 'hex');
    if (tag.length === 0) throw new Error('Missing auth tag');

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  randomBytes(length: number): Uint8Array {
    const crypto = require('react-native-quick-crypto');
    return new Uint8Array(crypto.randomBytes(length));
  }
}
