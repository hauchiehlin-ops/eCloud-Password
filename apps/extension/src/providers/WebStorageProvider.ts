import { IStorageProvider, VaultItem } from '@private-vault/core';

export class WebStorageProvider implements IStorageProvider {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'Cloud PasswordWebDB';
  private readonly STORE_NAME = 'vault_items';

  async openDatabase(databaseKey?: string): Promise<void> {
    // IndexedDB 在瀏覽器中無法直接設定密碼，其安全性依賴於 VaultManager 寫入前的 AES-GCM 加密
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          // id 為 Primary Key
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('updated_at', 'updated_at', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async closeDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async getAllItems(): Promise<VaultItem[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as VaultItem[]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveItem(item: VaultItem): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(item); // 若 id 已存在則覆蓋

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveBatch(items: VaultItem[]): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      items.forEach(item => {
        store.put(item);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteItem(id: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async setMetadata(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem('pv_salt');
    localStorage.removeItem('pv_verify');
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
