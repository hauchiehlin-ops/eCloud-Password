import { ICryptoProvider } from '@private-vault/core';

const SALT_SIZE = 16;
const IV_SIZE = 12;

// Helper: Uint8Array to Hex string
function buf2hex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Hex string to Uint8Array
function hex2buf(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

export class WebCryptoProvider implements ICryptoProvider {
  /**
   * 使用 Web Crypto API 實作 PBKDF2-HMAC-SHA512
   */
  async deriveKey(masterPassword: string, salt?: string): Promise<{ key: Uint8Array; salt: string }> {
    const enc = new TextEncoder();
    const passwordBuffer = enc.encode(masterPassword);
    const finalSalt = salt ? hex2buf(salt) : this.randomBytes(SALT_SIZE);
    
    // 1. 導入原始密碼金鑰
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // 2. 執行 PBKDF2 衍生 (100,000 次疊代，與 Mobile 保持一致)
    const derivedKeyBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: finalSalt,
        iterations: 100000,
        hash: 'SHA-512'
      },
      baseKey,
      256 // 32 bytes
    );

    return {
      key: new Uint8Array(derivedKeyBuffer),
      salt: buf2hex(finalSalt),
    };
  }

  async encryptData(plaintext: string, key: Uint8Array): Promise<{ iv: string; ciphertext: string; authTag: string }> {
    const iv = this.randomBytes(IV_SIZE);
    const enc = new TextEncoder();
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      enc.encode(plaintext)
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    // Web Crypto 的 AES-GCM 返回的是 [ciphertext + 16-byte auth tag]
    const ciphertext = encryptedArray.slice(0, -16);
    const authTag = encryptedArray.slice(-16);

    return {
      iv: buf2hex(iv),
      ciphertext: buf2hex(ciphertext),
      authTag: buf2hex(authTag),
    };
  }

  async decryptData(encryptedData: { iv: string; ciphertext: string; authTag: string }, key: Uint8Array): Promise<string> {
    const iv = hex2buf(encryptedData.iv);
    const ciphertext = hex2buf(encryptedData.ciphertext);
    const authTag = hex2buf(encryptedData.authTag);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // 組合 ciphertext 和 authTag 為 Web Crypto 預期的格式
    const payload = new Uint8Array(ciphertext.length + authTag.length);
    payload.set(ciphertext);
    payload.set(authTag, ciphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      payload
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  }

  randomBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return array;
  }
}
