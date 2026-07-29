/**
 * 保險箱單筆紀錄之共用資料模型
 */
export interface VaultItem {
  id: string; // UUID v4
  service_name: string; // 盲索引或明文
  username: string; // 盲索引或明文
  encrypted_payload: string; // JSON string of { iv, ciphertext, authTag }
  updated_at: number; // Unix timestamp
  version: number;
  deleted?: boolean; // 墓碑標記
  deleted_at?: number; // 刪除時間戳
  type?: 'PASSWORD' | 'PASSKEY' | 'CARD';
  category?: string;
}

/**
 * 信用卡專用資料結構
 */
export interface CreditCardPayload {
  cardholderName: string;
  cardNumber: string;
  expiryDate: string; // 格式: MM/YY
  cvv: string;
  brand: string; // Visa, MasterCard, etc.
  notes?: string;
}
