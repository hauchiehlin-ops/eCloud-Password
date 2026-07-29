import { VaultItem } from '../models/VaultItem';

/**
 * 跨平台本地資料庫儲存介面 (Dependency Injection)
 * 允許 Mobile 實作 SQLCipher，Extension 實作 IndexedDB。
 */
export interface IStorageProvider {
  /**
   * 初始化並解鎖儲存引擎
   * @param databaseKey 用於解鎖加密資料庫的金鑰 (僅 Mobile 適用，Web 端通常不需要傳入或使用不同防護機制)
   */
  openDatabase(databaseKey?: string): Promise<void>;

  /**
   * 關閉並鎖定儲存引擎
   */
  closeDatabase(): Promise<void>;

  /**
   * 取得所有保險箱項目
   */
  getAllItems(): Promise<VaultItem[]>;

  /**
   * 儲存或更新單筆項目
   * @param item VaultItem
   */
  saveItem(item: VaultItem): Promise<void>;

  /**
   * 批次儲存項目 (適用於雲端同步拉取後寫入)
   * @param items VaultItem 陣列
   */
  saveBatch(items: VaultItem[]): Promise<void>;

  /**
   * 刪除單筆項目
   */
  deleteItem(id: string): Promise<void>;

  /**
   * 清除所有資料
   */
  clearAll?(): Promise<void>;

  /**
   * 存取保險箱元數據 (如鹽值、同步狀態等)
   */
  getMetadata?(key: string): Promise<string | null>;
  setMetadata?(key: string, value: string): Promise<void>;
}
