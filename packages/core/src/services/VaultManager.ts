// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { ICryptoProvider } from '../interfaces/ICryptoProvider';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { VaultItem } from '../models/VaultItem';
import { PrivacyAuditor } from '../utils/AIGuard';

export class VaultManager {
  private cryptoProvider: ICryptoProvider;
  private storageProvider: IStorageProvider;
  private sessionKey: Uint8Array | null = null;

  /**
   * 建構子：注入跨平台實作
   */
  constructor(cryptoProvider: ICryptoProvider, storageProvider: IStorageProvider) {
    this.cryptoProvider = cryptoProvider;
    this.storageProvider = storageProvider;
  }

  /**
   * 解鎖保險箱：衍生金鑰並掛載本地資料庫
   */
  public async unlockVault(masterPassword: string, storedSalt: string, preDerivedKey?: Uint8Array): Promise<void> {
    PrivacyAuditor.logAccess('VaultManager', 'Unlocking vault with master key');
    
    if (preDerivedKey) {
      this.sessionKey = preDerivedKey;
    } else {
      // 衍生 Session Key
      const derived = await this.cryptoProvider.deriveKey(masterPassword, storedSalt);
      this.sessionKey = derived.key;
    }

    // 開啟底層儲存引擎 (Mobile 為 SQLCipher, Extension 為 IndexedDB)
    await this.storageProvider.openDatabase();
  }

  /**
   * 取得保險箱內的原始數據 (加密狀態)
   */
  public async getRawItems(): Promise<VaultItem[]> {
    return await this.storageProvider.getAllItems();
  }

  /**
   * 鎖定保險箱：清除記憶體金鑰狀態並關閉資料庫
   */
  public async lockVault(): Promise<void> {
    if (this.sessionKey) {
      // 抹除記憶體殘留 (Zeroing out)
      this.sessionKey.fill(0);
      this.sessionKey = null;
    }
    await this.storageProvider.closeDatabase();
  }

  /**
   * 檢查是否已解鎖
   */
  public isUnlocked(): boolean {
    return this.sessionKey !== null;
  }

  /**
   * 新增一筆密碼項目
   * Pipeline: 明文 -> JSON 打包 -> AES-256-GCM 加密 -> 儲存引擎
   */
  public async addEntry(serviceName: string, username: string, secretPayload: object, category?: string): Promise<VaultItem> {
    if (!this.sessionKey) throw new Error('Vault is locked');

    const plaintext = JSON.stringify(secretPayload);
    const encryptedObj = await this.cryptoProvider.encryptData(plaintext, this.sessionKey);
    
    const newItem: VaultItem = {
      id: uuidv4(),
      service_name: serviceName,
      username: username,
      encrypted_payload: JSON.stringify(encryptedObj),
      updated_at: Date.now(),
      version: 1,
      category: category,
      type: (secretPayload as any)?.cardNumber ? 'CARD' : 'PASSWORD',
    };

    await this.storageProvider.saveItem(newItem);
    return newItem;
  }

  /**
   * 批量新增項目 (優化匯入效能)
   */
  public async addEntries(entries: { id?: string, serviceName: string, username: string, secretPayload: object, category?: string, updated_at?: number, version?: number, type?: VaultItem['type'] }[]): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault is locked');
    
    const newItems: VaultItem[] = await Promise.all(entries.map(async (entry) => {
      const plaintext = JSON.stringify(entry.secretPayload);
      const encryptedObj = await this.cryptoProvider.encryptData(plaintext, this.sessionKey!);
      return {
        id: entry.id || uuidv4(),
        service_name: entry.serviceName,
        username: entry.username,
        encrypted_payload: JSON.stringify(encryptedObj),
        updated_at: entry.updated_at || Date.now(),
        version: entry.version || 1,
        category: entry.category,
        type: entry.type || ((entry.secretPayload as any)?.cardNumber ? 'CARD' : 'PASSWORD'),
        deleted: false
      };
    }));

    await this.storageProvider.saveBatch(newItems);
  }

  /**
   * 讀取並解密所有保險箱項目
   * Pipeline: 儲存引擎 -> AES-256-GCM 解密 -> JSON 解析
   */
  public async getDecryptedItems(): Promise<{ items: any[]; failedCount: number }> {
    PrivacyAuditor.logAccess('VaultManager', 'Decrypting all items for UI view');
    if (!this.sessionKey) throw new Error('Vault is locked');

    const allItems = await this.storageProvider.getAllItems();
    const encryptedItems = allItems.filter(item => !item.deleted);
    let failedCount = 0;
    
    // 平行解密提升效能 (加入容錯處理)
    const decryptedPromises = encryptedItems.map(async (item) => {
      try {
        const encryptedObj = JSON.parse(item.encrypted_payload);
        
        // [PAC 自癒]：相容舊版的 tag 欄位名稱
        const normalizedPayload = {
          iv: encryptedObj.iv,
          ciphertext: encryptedObj.ciphertext,
          authTag: encryptedObj.authTag || encryptedObj.tag
        };

        const decryptedJson = await this.cryptoProvider.decryptData(normalizedPayload, this.sessionKey!);
        
        return {
          id: item.id,
          serviceName: item.service_name,
          username: item.username,
          secretPayload: JSON.parse(decryptedJson),
          updatedAt: item.updated_at,
          version: item.version,
          type: item.type,
          category: item.category,
        };
      } catch (e) {
        failedCount++;
        PrivacyAuditor.logAccess('VaultManager', `Decryption failed for item ${item.id}: Key mismatch or data corruption`);
        return null;
      }
    });

    const results = await Promise.all(decryptedPromises);
    return {
      items: results.filter((r): r is any => r !== null),
      failedCount
    };
  }

  /**
   * 變更主密碼：重新衍生金鑰，並將資料庫內所有卡片重新加密
   */
  public async changeMasterKey(newMasterPassword: string): Promise<{ newSalt: string; newKey: Uint8Array }> {
    if (!this.sessionKey) throw new Error('Vault must be unlocked to change master key');

    // 1. 先用舊金鑰解出所有資料
    const items = await this.storageProvider.getAllItems();
    const decryptedDataList = [];
    
    for (const item of items) {
      try {
        const encryptedObj = JSON.parse(item.encrypted_payload);
        const decryptedJson = await this.cryptoProvider.decryptData(encryptedObj, this.sessionKey!);
        decryptedDataList.push({ item, plaintext: decryptedJson });
      } catch (e) {
        PrivacyAuditor.logAccess('VaultManager', `Skipping item ${item.id} during key change: Decryption failed.`);
      }
    }

    if (items.length > 0 && decryptedDataList.length === 0) {
      throw new Error('Could not decrypt any items with the current key. Master key change aborted to prevent data loss.');
    }

    // 2. 衍生新金鑰與新鹽值
    const derived = await this.cryptoProvider.deriveKey(newMasterPassword);
    const newSessionKey = derived.key;
    const newSalt = derived.salt;

    // 3. 用新金鑰重新加密所有資料
    const reEncryptedItems: VaultItem[] = [];
    for (const data of decryptedDataList) {
      if (!data.plaintext) continue; // 再次確保資料存在
      try {
        const newEncryptedObj = await this.cryptoProvider.encryptData(data.plaintext, newSessionKey);
        reEncryptedItems.push({
          ...data.item,
          encrypted_payload: JSON.stringify(newEncryptedObj),
          updated_at: Date.now(),
          version: (data.item.version || 1) + 1
        });
      } catch (e) {
        console.warn(`[PAC] Failed to re-encrypt item ${data.item.id}:`, e);
      }
    }

    // 4. 原子化儲存新鹽值、驗證字串與時間戳（主金鑰修復核心）
    if (reEncryptedItems.length > 0) {
      await this.storageProvider.saveBatch(reEncryptedItems);
    }

    if (this.storageProvider.setMetadata) {
      const now = Date.now();
      const verifyData = await this.cryptoProvider.encryptData('AUTH_OK', newSessionKey);
      await this.storageProvider.setMetadata('pv_salt', newSalt);
      await this.storageProvider.setMetadata('pv_verify', JSON.stringify(verifyData));
      await this.storageProvider.setMetadata('pv_salt_updated_at', String(now));
    }

    // 5. 更新當前 Session
    this.sessionKey = newSessionKey;

    return { newSalt, newKey: newSessionKey };
  }

  /**
   * 更新單筆密碼項目
   */
  public async updateEntry(id: string, serviceName: string, username: string, secretPayload: object, category?: string): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault is locked');
    const all = await this.storageProvider.getAllItems();
    const item = all.find(i => i.id === id);
    if (!item) throw new Error('Item not found');

    const plaintext = JSON.stringify(secretPayload);
    const encryptedObj = await this.cryptoProvider.encryptData(plaintext, this.sessionKey);

    item.service_name = serviceName;
    item.username = username;
    item.encrypted_payload = JSON.stringify(encryptedObj);
    item.updated_at = Date.now();
    item.version = (item.version || 1) + 1;
    item.category = category;
    item.type = (secretPayload as any)?.cardNumber ? 'CARD' : 'PASSWORD';

    await this.storageProvider.saveItem(item);
  }

  /**
   * 刪除單筆密碼項目
   */
  public async deleteEntry(id: string): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault is locked');
    const items = await this.storageProvider.getAllItems();
    const item = items.find(i => i.id === id);
    if (item) {
      item.deleted = true;
      item.deleted_at = Date.now();
      item.updated_at = Date.now();
      item.version = (item.version || 1) + 1; // 增加版本號確保同步優先級
      await this.storageProvider.saveItem(item);
    }
  }

  /**
   * 物理刪除項目 (供 SyncEngine 清理已同步的墓碑使用)
   */
  public async hardDeleteRaw(id: string): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault is locked');
    await this.storageProvider.deleteItem(id);
  }

  /**
   * 取得尚未解密的原始資料 (供 SyncEngine 使用)
   */
  public async getRawItemsInternal(): Promise<VaultItem[]> {
    return this.storageProvider.getAllItems();
  }

  /**
   * 批次儲存原始資料 (供 SyncEngine 合併後寫入)
   */
  public async saveBatchRaw(items: VaultItem[]): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault is locked');
    await this.storageProvider.saveBatch(items);
  }

  /**
   * 檢查原始項目是否可用當前 Session Key 解密。
   * SyncEngine 用它清理跨鹽值或重複匯入造成的不可解密副本。
   */
  public async canDecryptRawItem(item: VaultItem): Promise<boolean> {
    if (!this.sessionKey) return false;
    if (item.deleted) return true;
    try {
      const encryptedObj = JSON.parse(item.encrypted_payload);
      await this.cryptoProvider.decryptData({
        iv: encryptedObj.iv,
        ciphertext: encryptedObj.ciphertext,
        authTag: encryptedObj.authTag || encryptedObj.tag
      }, this.sessionKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 取得目前的鹽值 (Salt)
   * 優先從存儲引擎的元數據中取得，確保跨平台一致性
   */
  public async getSalt(): Promise<string | null> {
    if (this.storageProvider.getMetadata) {
      return await this.storageProvider.getMetadata('pv_salt');
    }
    return null;
  }

  /**
   * 強制重新加密指定的數據以對齊新的鹽值 (原子化轉換)
   */
  public async reEncryptLocalData(newSalt: string, masterPassword: string, preFetchedItems: any[], preFetchedFailedCount: number): Promise<void> {
    if (!this.sessionKey) throw new Error('Vault must be unlocked');

    // [PAC 安全熔斷]：在鹽值對齊過程中，我們允許解密失敗，因為這正是對齊要解決的問題。
    if (preFetchedFailedCount > 0) {
      PrivacyAuditor.logAccess('VaultManager', `Notice: Salt alignment proceeding with ${preFetchedFailedCount} undecryptable items.`);
    }

    if (preFetchedItems.length === 0) {
      PrivacyAuditor.logAccess('VaultManager', 'Salt alignment skipped: No items to re-encrypt.');
    }

    // 1. 使用新鹽值衍生新金鑰
    const derived = await this.cryptoProvider.deriveKey(masterPassword, newSalt);
    const newKey = derived.key;

    // 2. 用新金鑰重新加密 (使用傳入的解密後資料)
    const reEncrypted: VaultItem[] = await Promise.all(preFetchedItems.map(async (data) => {
      const plaintext = JSON.stringify(data.secretPayload);
      const encryptedObj = await this.cryptoProvider.encryptData(plaintext, newKey);
      
      return {
        id: data.id,
        service_name: data.serviceName || data.service_name,
        username: data.username,
        encrypted_payload: JSON.stringify(encryptedObj),
        updated_at: Date.now(),
        version: (data.version || 1) + 1,
        category: data.category,
        deleted: !!data.deleted
      };
    }));

    // [PAC 最終完整性校驗]
    if (preFetchedItems.length > 0 && reEncrypted.length === 0) {
      throw new Error('Critical Error: Re-encryption resulted in zero items. Aborting save.');
    }

    // 4. 更新本地儲存、Salt 與驗證字串 (Verification String)
    if (this.storageProvider.setMetadata) {
      await this.storageProvider.setMetadata('pv_salt', newSalt);
      
      // [PAC 修復]：產生新的驗證字串，確保下次登入時與新金鑰匹配
      const verifyData = await this.cryptoProvider.encryptData('AUTH_OK', newKey);
      await this.storageProvider.setMetadata('pv_verify', JSON.stringify(verifyData));
    }
    await this.storageProvider.saveBatch(reEncrypted);
    
    // 5. 更新 Session
    this.sessionKey = newKey;
    PrivacyAuditor.logAccess('VaultManager', `Salt alignment complete. Synchronized ${reEncrypted.length} items to new key.`);
  }

  /**
   * 抹除所有本地數據
   */
  public async wipeAll(): Promise<void> {
    PrivacyAuditor.logAccess('VaultManager', 'Wiping all local vault data');
    if (this.storageProvider.clearAll) {
      await this.storageProvider.clearAll();
    }
  }
}
