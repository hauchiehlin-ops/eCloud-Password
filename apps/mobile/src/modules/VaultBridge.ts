import { NativeModules, Platform, Linking } from 'react-native';

const { VaultBridge } = NativeModules;

export interface AutofillCredential {
  id: string;
  serviceName: string;
  username: string;
  password?: string;
  url?: string;
  type?: 'PASSWORD' | 'CARD';
  cardholderName?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
}

/**
 * 跨行程通訊 (Bridge):
 * 將 React Native 中的密碼清單傳遞給原生層，原生層會自動進行硬體加密並存入共享區塊，
 * 供 iOS Credential Provider 與 Android Autofill Service 在背景讀取。
 */
export const syncToNativeAutofill = async (credentials: AutofillCredential[]): Promise<boolean> => {
  if (!VaultBridge) {
    console.warn('VaultBridge native module is not yet implemented or linked.');
    return false;
  }
  
  try {
    // 為了安全與效能，只傳遞供自動填寫所需的最小必備欄位
    const minimalData = credentials.map(c => ({
      id: c.id,
      serviceName: c.serviceName,
      username: c.username,
      password: c.password,
      url: c.url,
      type: c.type || 'PASSWORD',
      cardholderName: c.cardholderName,
      cardNumber: c.cardNumber,
      expiryDate: c.expiryDate,
      cvv: c.cvv
    }));

    const jsonString = JSON.stringify(minimalData);
    console.log('[VaultBridge] Syncing credentials count:', minimalData.length);
    console.log('[VaultBridge] Payload sample (service):', minimalData[0]?.serviceName);
    
    await VaultBridge.syncCredentials(jsonString);
    return true;
  } catch (error) {
    console.error('Failed to sync credentials to native autofill:', error);
    return false;
  }
};

/**
 * 清除跨行程通訊區塊的資料。
 * 當使用者重置 App 或關閉系統級整合功能時呼叫。
 */
export const clearNativeAutofill = async (): Promise<boolean> => {
  if (!VaultBridge) return false;
  
  try {
    await VaultBridge.clearCredentials();
    return true;
  } catch (error) {
    console.error('Failed to clear native credentials:', error);
    return false;
  }
};

/**
 * 打開系統的密碼管理/自動填寫設定頁面
 * 讓使用者能夠設定此 App 為預設密碼管理器
 */
export const openOSAutofillSettings = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    try {
      // iOS direct deep link to Passwords & Auto-fill settings
      // Ref: App-Prefs:root=PASSWORDS&path=AUTOFILL
      const url = 'App-Prefs:PASSWORDS';
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return true;
      }
    } catch (e) {
      console.warn('Deep link failed, falling back to general settings', e);
    }
    await Linking.openSettings();
    return true;
  }

  if (!VaultBridge || !VaultBridge.openAutofillSettings) {
    console.warn('VaultBridge.openAutofillSettings is not implemented.');
    return false;
  }

  try {
    return await VaultBridge.openAutofillSettings();
  } catch (error) {
    console.error('Failed to open OS autofill settings:', error);
    return false;
  }
};

/**
 * 重新同步 iOS Credential Identity Store（鍵盤建議列）。
 * 僅 iOS 需要；Android 由 VaultAutofillService 在每次觸發時即時讀取，不需要此步驟。
 * 呼叫時機：
 *   1. 使用者成功解鎖 Vault 後
 *   2. 雲端同步完成（新增/修改/刪除）後
 */
export const refreshiOSCredentialStore = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  if (!VaultBridge?.refreshCredentialStore) {
    console.warn('[VaultBridge] refreshCredentialStore not available (old native build?)');
    return false;
  }
  try {
    const result = await VaultBridge.refreshCredentialStore();
    console.log('[VaultBridge] iOS CredentialIdentityStore refreshed:', result);
    return !!result;
  } catch (error) {
    console.error('[VaultBridge] refreshCredentialStore failed:', error);
    return false;
  }
};
