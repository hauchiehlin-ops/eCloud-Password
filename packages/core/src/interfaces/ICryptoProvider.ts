/**
 * 跨平台加解密引擎介面 (Dependency Injection)
 * 允許 Mobile 實作 Native Crypto，Extension 實作 Web Crypto API。
 */
export interface ICryptoProvider {
  /**
   * 根據主密碼與鹽值衍生加密金鑰
   * @param masterPassword 來源明文密碼
   * @param salt 鹽值
   * @returns 回傳包含 256-bit 金鑰與鹽值的物件
   */
  deriveKey(masterPassword: string, salt?: string): Promise<{ key: Uint8Array; salt: string }>;

  /**
   * 使用 AES-256-GCM 進行 Authenticated Encryption
   * @param plaintext 明文資料字串 (通常為 JSON)
   * @param key 256-bit 加密金鑰
   * @returns 包含 IV, Ciphertext, AuthTag 的 Base64/Hex 編碼物件
   */
  encryptData(plaintext: string, key: Uint8Array): Promise<{ iv: string; ciphertext: string; authTag: string }>;

  /**
   * 使用 AES-256-GCM 進行解密與驗證
   * @param encryptedData 加密物件
   * @param key 256-bit 解密金鑰
   * @returns 原始明文字串
   * @throws 若 AuthTag 驗證失敗 (被竄改) 則拋出錯誤
   */
  decryptData(encryptedData: { iv: string; ciphertext: string; authTag: string }, key: Uint8Array): Promise<string>;

  /**
   * 密碼學安全的隨機位元組產生器
   * @param length 需要的位元組長度
   */
  randomBytes(length: number): Uint8Array;
}
