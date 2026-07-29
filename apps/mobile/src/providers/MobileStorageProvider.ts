import { IStorageProvider, VaultItem } from '@private-vault/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const DB_KEY = 'pv_vault_items';

/**
 * Mobile 端儲存層
 * 使用 AsyncStorage（也可日後升級成 expo-sqlite + SQLCipher）
 * Vault 資料以已加密的 JSON Array 形式存放
 */
export class MobileStorageProvider implements IStorageProvider {
  async openDatabase(_key?: string): Promise<void> {
    // AsyncStorage 不需要明確的 open 動作
  }

  async closeDatabase(): Promise<void> {
    // AsyncStorage 不需要明確的 close 動作
  }

  async getAllItems(): Promise<VaultItem[]> {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VaultItem[];
  }

  async saveItem(item: VaultItem): Promise<void> {
    const existing = await this.getAllItems();
    const idx = existing.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      existing[idx] = item; // 更新
    } else {
      existing.push(item); // 新增
    }
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(existing));
  }

  async saveBatch(items: VaultItem[]): Promise<void> {
    const existing = await this.getAllItems();
    for (const item of items) {
      const idx = existing.findIndex(i => i.id === item.id);
      if (idx >= 0) {
        existing[idx] = item;
      } else {
        existing.push(item);
      }
    }
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(existing));
  }

  async deleteItem(id: string): Promise<void> {
    const existing = await this.getAllItems();
    const filtered = existing.filter(i => i.id !== id);
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(filtered));
  }

  async clearAll(): Promise<void> {
    // 1. 清除保險箱加密項目
    await AsyncStorage.removeItem(DB_KEY);
    
    // 2. 清除關鍵安全元數據 (Salt, Verify Data, Biometric Link)
    await SecureStore.deleteItemAsync('pv_salt');
    await SecureStore.deleteItemAsync('pv_verify');
    await SecureStore.deleteItemAsync('pv_biometric_master');
    await SecureStore.deleteItemAsync('pv_onboarding_done');
    await SecureStore.deleteItemAsync('pv_lang');
    await SecureStore.deleteItemAsync('pv_categories');
  }


  // 實作元數據存取，對接 Expo SecureStore
  async getMetadata(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  }

  async setMetadata(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }
}
