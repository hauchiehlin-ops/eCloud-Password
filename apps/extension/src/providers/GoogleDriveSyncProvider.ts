import { ICloudSyncProvider, VaultItem, SyncPayload } from '@private-vault/core';

const SYNC_FILE_NAME = 'vault_sync.json';

export class GoogleDriveSyncProvider implements ICloudSyncProvider {
  /**
   * 取得 Google OAuth Token
   */
  async authenticate(interactive: boolean = false): Promise<string> {
    if (typeof chrome === 'undefined' || !chrome.identity) {
      throw new Error('Google Sync is only available when installed as a Chrome Extension.');
    }
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || 'Authentication failed'));
        } else {
          resolve(token);
        }
      });
    });
  }

  async isAuthenticated(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.identity) return false;
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        const err = chrome.runtime.lastError;
        resolve(!!token);
      });
    });
  }

  /**
   * 尋找 appDataFolder 中是否已經有我們的同步檔，沒有的話就建立一個
   */
  private async getOrCreateSyncFileId(token: string): Promise<string> {
    // 1. 搜尋檔案
    const query = `name='${SYNC_FILE_NAME}'`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // 2. 如果不存在，建立空檔案
    const metadata = {
      name: SYNC_FILE_NAME,
      parents: ['appDataFolder']
    };
    
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    
    const createData = await createRes.json();
    return createData.id;
  }

  /**
   * 將本地加密資料上傳覆寫至 Drive
   */
  async pushData(payload: SyncPayload): Promise<void> {
    const token = await this.authenticate(true);
    const fileId = await this.getOrCreateSyncFileId(token);
    const content = JSON.stringify(payload);
    
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: content
    });

    if (!res.ok) {
      throw new Error(`Failed to push data: ${res.statusText}`);
    }
  }

  /**
   * 從 Drive 下載雲端的加密資料
   */
  async pullData(): Promise<SyncPayload | null> {
    const token = await this.authenticate(false);
    const fileId = await this.getOrCreateSyncFileId(token);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 404 || res.status === 204) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Failed to pull data: ${res.statusText}`);
    }

    const text = await res.text();
    if (!text) return null;
    
    try {
      const rawData = JSON.parse(text);
      if (Array.isArray(rawData)) {
        return { salt: '', items: rawData };
      }
      return rawData as SyncPayload;
    } catch {
      return null;
    }
  }

  /**
   * 登出 Google 帳戶並清除快取 Token
   */
  async logout(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.identity) return;
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        const err = chrome.runtime.lastError;
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            const err2 = chrome.runtime.lastError;
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 取得 Chrome 登入者的 Email 資訊
   */
  async getUserInfo(): Promise<{ email: string } | null> {
    if (typeof chrome === 'undefined' || !chrome.identity) return null;
    try {
      const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
      return { email: userInfo.email || 'Unknown' };
    } catch {
      return null;
    }
  }
}
