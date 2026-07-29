import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { Platform, Alert } from 'react-native';
import { ICloudSyncProvider, VaultItem, SyncPayload } from '@private-vault/core';

const IOS_CLIENT_ID = '39865597076-qeun10r8fooabrf6vs7buac4l3ti1nrm.apps.googleusercontent.com';
const WEB_CLIENT_ID = '39865597076-euue5evjprair5ihe97fttbsbum5f252.apps.googleusercontent.com';

const SYNC_FILE_NAME = 'vault_sync.json';
const TOKEN_KEY = 'pv_google_access_token';

// [PAC] 配置恢復：因 iOS Plist 未手動連結，必須在 JS 端提供 iosClientId
const CONFIG = {
  iosClientId: IOS_CLIENT_ID, 
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
    'email',
    'profile'
  ]
};

// [PAC] 確保在模組載入時僅配置一次
GoogleSignin.configure(CONFIG);

export class MobileGoogleDriveSyncProvider implements ICloudSyncProvider {
  private authPromise: Promise<string> | null = null;

  async isAuthenticated(): Promise<boolean> {
    try {
      const cached = await SecureStore.getItemAsync(TOKEN_KEY);
      if (cached) return true;
      return await GoogleSignin.hasPreviousSignIn();
    } catch {
      return false;
    }
  }

  async authenticate(interactive: boolean = false): Promise<string> {
    // [PAC Mutex] 防止並發呼叫導致的 getTokens 競態錯誤
    if (this.authPromise) {
      console.log('[PAC] Authentication already in progress, joining...');
      return this.authPromise;
    }

    this.authPromise = this.performAuth(interactive);
    try {
      const token = await this.authPromise;
      return token;
    } finally {
      this.authPromise = null; // 結束後清除，以便下次呼叫
    }
  }

  private async performAuth(interactive: boolean = false): Promise<string> {
    try {
      const cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (cachedToken) return cachedToken;

      console.log('[PAC] Starting Singleton Authentication Flow...');
      await GoogleSignin.hasPlayServices();
      
      let user: any = null;
      // 優先檢查是否有先前登入的痕跡
      const hasPrevious = await GoogleSignin.hasPreviousSignIn();
      if (hasPrevious) {
        console.log('[PAC] Previous sign-in detected, trying silent...');
        const silentResult = await GoogleSignin.signInSilently().catch(() => null);
        if (silentResult?.type === 'success') {
          user = silentResult;
        }
      }
      
      if (!user) {
        console.log('[PAC] No valid session, triggering interactive sign-in...');
        if (!interactive) throw new Error('SIGN_IN_REQUIRED');
        await GoogleSignin.signOut().catch(() => {});
        user = await GoogleSignin.signIn();
        if (user.type === 'cancelled') throw new Error('SIGN_IN_CANCELLED');
        if (user.type !== 'success') throw new Error(`SIGN_IN_FAILED: ${user.type}`);
      }
      
      console.log('[PAC] Native signIn completed! Raw User Object:', JSON.stringify(user, null, 2));

      // [PAC Fix] 增加循環檢查機制，最多等待 5 秒直到 Native Session 就緒
      let finalToken: string | null = null;
      let retries = 5;
      
      // 優先檢查 signIn 回傳的對象中是否已有 Token
      if ((user as any)?.data?.accessToken) {
        finalToken = (user as any).data.accessToken;
      }

      while (retries > 0 && !finalToken) {
        try {
          console.log(`[PAC] Attempting getTokens (retries left: ${retries})...`);
          const tokens = await GoogleSignin.getTokens();
          if (tokens?.accessToken) {
            finalToken = tokens.accessToken;
          }
        } catch (e: any) {
          console.log('[PAC] getTokens waiting for session...', e.message);
          await new Promise(res => setTimeout(res, 1000));
          retries--;
          
          if (retries === 1) {
            await GoogleSignin.addScopes({ scopes: CONFIG.scopes }).catch(() => {});
          }
        }
      }

      if (!finalToken) throw new Error('TOKEN_EMPTY_AFTER_RETRIES');

      console.log('[PAC] Token retrieved successfully');
      await SecureStore.setItemAsync(TOKEN_KEY, finalToken);
      return finalToken;

    } catch (recoveryError: any) {
      if (recoveryError.message === 'SIGN_IN_REQUIRED') {
        throw recoveryError;
      }

      const isSilentError = recoveryError.message === 'TOKEN_EMPTY_AFTER_RETRIES' || recoveryError.message === 'SIGN_IN_CANCELLED' || recoveryError.code === statusCodes?.SIGN_IN_CANCELLED;

      if (!isSilentError) {
        console.error('[PAC] Recovery failed, clearing everything.', recoveryError.message);
      } else {
        console.log('[PAC] Auth cancelled or empty token (silent fallback triggered).');
      }

      // iOS 專屬：嘗試徹底撤銷授權以清除損壞的快取
      if (Platform.OS === 'ios') {
        await GoogleSignin.revokeAccess().catch(() => {});
      }
      await GoogleSignin.signOut().catch(() => {});
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      
      // [PAC Diagnostic] 印出當前配置資訊，確保沒有抓錯 Client ID
      console.log('[PAC] Config - Platform:', Platform.OS);
      console.log('[PAC] Config - iOS ID:', CONFIG.iosClientId || 'From Plist');
      console.log('[PAC] Config - Web ID:', WEB_CLIENT_ID);

      let errorDetail = recoveryError.message;
      if (statusCodes) {
        if (recoveryError.code === statusCodes.SIGN_IN_CANCELLED) errorDetail = 'User Cancelled';
        else if (recoveryError.code === statusCodes.IN_PROGRESS) errorDetail = 'Auth In Progress';
        else if (recoveryError.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) errorDetail = 'Play Services Not Available';
        else if (recoveryError.code === '7') errorDetail = 'Network Error (Check Internet)';
        else if (recoveryError.code === '10') errorDetail = 'DEVELOPER_ERROR (Check Bundle ID/Plist)';
      }

      if (interactive && !isSilentError) {
        Alert.alert('Google Auth Error', `Code: ${recoveryError.code}\nDetail: ${errorDetail}\n\nHint: Verify GoogleService-Info.plist matches Bundle ID.`);
      }
      throw recoveryError;
    }
  }

  async pushData(payload: SyncPayload, retryCount = 0): Promise<void> {
    try {
      const token = await this.authenticate();
      const content = JSON.stringify(payload);

      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&orderBy=modifiedTime desc&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      if (existingFile) {
        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: content,
          }
        );
        if (!res.ok) throw new Error(`Push failed: ${res.status}`);
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'] }),
        });
        const fileData = await createRes.json();
        if (fileData.id) {
          const res = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileData.id}?uploadType=media`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: content,
            }
          );
          if (!res.ok) throw new Error(`Initial push failed: ${res.status}`);
        }
      }
    } catch (e: any) {
      if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED') || e.message.includes('403')) {
        console.log('[PAC] 401/403 detected in pushData, clearing token and retrying...');
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        if (retryCount < 2) {
          return await this.pushData(payload, retryCount + 1);
        }
      }
      throw e;
    }
  }

  async pullData(retryCount = 0): Promise<SyncPayload | null> {
    try {
      const token = await this.authenticate();
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&orderBy=modifiedTime desc&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!searchRes.ok) {
        const errText = await searchRes.text();
        if (searchRes.status === 401 || searchRes.status === 403) {
          console.log(`[PAC] ${searchRes.status} detected in pullData, clearing token and retrying...`);
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          if (retryCount < 2) {
            return await this.pullData(retryCount + 1);
          }
        }
        throw new Error(`Cloud Pull Search Error: ${searchRes.status} - ${errText}`);
      }

      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      if (existingFile) {
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (!downloadRes.ok) {
          if (downloadRes.status === 401 || downloadRes.status === 403) {
             await SecureStore.deleteItemAsync(TOKEN_KEY);
             if (retryCount < 2) {
               return await this.pullData(retryCount + 1);
             }
          }
          throw new Error(`Cloud Download Error: ${downloadRes.status}`);
        }

        const rawData = await downloadRes.json();
        if (Array.isArray(rawData)) {
          return { salt: '', items: rawData };
        }
        return rawData as SyncPayload;
      }
      return null;
    } catch (e: any) {
      if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED') || e.message.includes('403')) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        if (retryCount < 2) {
          return await this.pullData(retryCount + 1);
        }
      }
      throw e;
    }
  }

  async logout(): Promise<void> {
    await GoogleSignin.signOut();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  async getUserInfo(): Promise<{ email: string } | null> {
    try {
      const user = await GoogleSignin.getCurrentUser();
      if (user) {
        return { email: (user as any).user?.email ?? (user as any).data?.user?.email ?? 'Unknown' };
      }
      return null;
    } catch {
      return null;
    }
  }

  // [PAC] Manual File Operations for Custom Overrides (e.g., categories sync)
  async saveFile(filename: string, content: string, retryCount = 0): Promise<void> {
    try {
      const token = await this.authenticate();
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${filename}'&orderBy=modifiedTime desc&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      if (existingFile) {
        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: content,
          }
        );
        if (!res.ok) throw new Error(`Push failed: ${res.status}`);
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: filename, parents: ['appDataFolder'] }),
        });
        const fileData = await createRes.json();
        if (fileData.id) {
          const res = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileData.id}?uploadType=media`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: content,
            }
          );
          if (!res.ok) throw new Error(`Initial push failed: ${res.status}`);
        }
      }
    } catch (e: any) {
      if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED') || e.message.includes('403')) {
        console.log('[PAC] 401/403 in saveFile, retrying...');
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        if (retryCount < 2) {
          return await this.saveFile(filename, content, retryCount + 1);
        }
      }
      throw e;
    }
  }

  async getFile(filename: string, retryCount = 0): Promise<string | null> {
    try {
      const token = await this.authenticate();
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${filename}'&orderBy=modifiedTime desc&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!searchRes.ok) {
        if (searchRes.status === 401 || searchRes.status === 403) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          if (retryCount < 2) {
            return await this.getFile(filename, retryCount + 1);
          }
        }
        throw new Error(`Cloud Pull Search Error: ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      if (existingFile) {
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (!downloadRes.ok) {
          if (downloadRes.status === 401 || downloadRes.status === 403) {
             await SecureStore.deleteItemAsync(TOKEN_KEY);
             if (retryCount < 2) {
               return await this.getFile(filename, retryCount + 1);
             }
          }
          throw new Error(`Cloud Download Error: ${downloadRes.status}`);
        }

        return await downloadRes.text();
      }
      return null;
    } catch (e: any) {
      if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED') || e.message.includes('403')) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        if (retryCount < 2) {
          return await this.getFile(filename, retryCount + 1);
        }
      }
      throw e;
    }
  }
}

