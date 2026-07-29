import { VaultItem } from '../models/VaultItem';

/**
 * 衝突解決引擎 (純邏輯層)
 * 實作 Last-Write-Wins (LWW) 演算法，不依賴任何外部 I/O。
 */
export class ConflictResolver {
  /**
   * 根據 LWW 邏輯合併本地與遠端保險箱紀錄
   * @param localItems 本地資料庫紀錄
   * @param remoteItems 雲端拉取下來的紀錄
   * @returns 合併後的完整紀錄列表 (應寫入本地並同步至雲端)
   */
  public static resolveLWW(localItems: VaultItem[], remoteItems: VaultItem[]): VaultItem[] {
    const mergedMap = new Map<string, VaultItem>();

    // 1. 先將所有遠端項目寫入 Map
    for (const item of remoteItems) {
      mergedMap.set(item.id, item);
    }

    // 2. 遍歷本地項目進行比對
    for (const localItem of localItems) {
      const remoteItem = mergedMap.get(localItem.id);
      
      if (!remoteItem) {
        // 遠端無此資料：保留本地項目 (可能是新建立，也可能是本地已刪除但尚未同步)
        mergedMap.set(localItem.id, localItem);
      } else {
        const localTime = Number(localItem.updated_at || (localItem as any).updatedAt || 0);
        const remoteTime = Number(remoteItem.updated_at || (remoteItem as any).updatedAt || 0);

        const localVersion = localItem.version || 0;
        const remoteVersion = remoteItem.version || 0;

        if (localVersion > remoteVersion) {
          mergedMap.set(localItem.id, localItem);
        } else if (localVersion === remoteVersion) {
          // 如果版本相同，則以時間戳記決定 (LWW)
          if (localTime >= remoteTime) {
            mergedMap.set(localItem.id, localItem);
          }
          // else: 雲端較新，保留雲端 (Map 中已有的)
        } else {
          // 雲端版本號較高
          // remoteVersion > localVersion: 保留雲端 (Map 中已有的)
        }
      }
    }

    return Array.from(mergedMap.values());
  }
}
