import { VaultItem } from '../models/VaultItem';

export interface SyncPayload {
  salt: string;
  items: VaultItem[];
  licenseTier?: string;
  licenseUpdatedAt?: number;
  isWiped?: boolean;
  categories?: any[];
  categoriesUpdatedAt?: number;
}

export interface ICloudSyncProvider {
  /**
   * 啟動 OAuth 授權並取得 Access Token
   */
  authenticate(interactive?: boolean): Promise<string>;


  /**
   * 檢查是否已經獲得授權
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * 將本地端的加密資料推送到雲端 (包含 Salt)
   */
  pushData(payload: SyncPayload): Promise<void>;

  /**
   * 從雲端拉取最新的加密資料 (包含 Salt)
   */
  pullData(): Promise<SyncPayload | null>;

  /**
   * 登出雲端服務
   */
  logout(): Promise<void>;

  /**
   * 獲取目前登入的帳號資訊
   */
  getUserInfo?(): Promise<{ email: string } | null>;
}
