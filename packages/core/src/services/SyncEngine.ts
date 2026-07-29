import { VaultManager } from './VaultManager';
import { ICloudSyncProvider } from '../interfaces/ICloudSyncProvider';
import { ConflictResolver } from '../logic/ConflictResolver';
import { VaultItem } from '../models/VaultItem';
import { PrivacyAuditor } from '../utils/AIGuard';

export interface SyncResult {
  active: number;
  deleted: number;
  pushed: number;
  pulled: number;
  remoteItemCount: number;
  conflictsResolved: number;
  remoteLicenseTier?: string;
  remoteLicenseUpdatedAt?: number;
  remoteAccount?: string;
  mergedCategories?: any[];
  mergedCategoriesUpdatedAt?: number;
}

export class SyncEngine {
  private vaultManager: VaultManager;
  private syncProvider: ICloudSyncProvider;

  constructor(vaultManager: VaultManager, syncProvider: ICloudSyncProvider) {
    this.vaultManager = vaultManager;
    this.syncProvider = syncProvider;
  }

  /**
   * 啟動同步流程 (Push & Pull + LWW Merge + Salt Alignment)
   * @param masterPassword 用於鹽值不一致時自動執行重新加密對齊
   * @param preFetchedRawItems 預抓取的原始項目，避免併發讀取失敗
   */
  /**
   * 啟動同步流程 (Push & Pull + LWW Merge + Salt Alignment + Metadata Update)
   * [PAC 核心優化]：現在本方法會自動處理跨設備鹽值對齊，無需 UI 層手動修復。
   */
  public async sync(
    masterPassword?: string, 
    preFetchedRawItems: VaultItem[] = [],
    localCategories: any[] = [],
    localCategoriesUpdatedAt: number = 0,
    interactive: boolean = false
  ): Promise<SyncResult> {
    if (!this.vaultManager.isUnlocked()) {
      throw new Error('Vault must be unlocked to sync');
    }

    // 1. 驗證並獲取雲端資料
    PrivacyAuditor.logAccess('SyncEngine', 'Starting cross-platform cloud synchronization');
    await this.syncProvider.authenticate(interactive);

    let localItems = preFetchedRawItems.length > 0 ? preFetchedRawItems : await this.vaultManager.getRawItems();
    let localSalt = await (this.vaultManager as any).getSalt();
    const remotePayload = await this.syncProvider.pullData();
    const rawRemoteCount = remotePayload?.items?.length || 0;
    
    // 2. [PAC 原子化對齊]：處理加密鹽值不一致 (金鑰重新校準)
    // 這是跨設備同步的核心：如果雲端鹽值與本地不符，且我們有主密碼，則自動重刷本地加密。
    if (remotePayload && remotePayload.salt && remotePayload.salt !== localSalt) {
      if (masterPassword) {
        PrivacyAuditor.logAccess('SyncEngine', `PAC: Cross-device salt alignment detected (${localSalt} -> ${remotePayload.salt})`);
        
        // a. 解出當前所有資料 (使用舊鹽值)
        const { items: decryptedItems, failedCount } = await this.vaultManager.getDecryptedItems();
        
        // b. 使用新鹽值重新加密並更新本地 Metadata (pv_salt, pv_verify)
        await (this.vaultManager as any).reEncryptLocalData(remotePayload.salt, masterPassword, decryptedItems, failedCount);
        
        // c. 刷新本地狀態變數
        localSalt = remotePayload.salt;
      } else {
        // 如果沒有密碼 (例如背景同步)，我們無法對齊，拋出錯誤讓 UI 提示使用者
        throw new Error('SALT_MISMATCH_REQUIRES_PASSWORD');
      }
    }

    // 3. 資料標準化與合併 (LWW 邏輯)
    const currentRawItems = await this.vaultManager.getRawItems();
    const normalize = (items: any[]) => items.map(i => ({
      id: i.id,
      service_name: i.service_name || i.serviceName || 'Unknown',
      username: i.username || '',
      encrypted_payload: i.encrypted_payload || i.encryptedPayload || '',
      updated_at: Number(i.updated_at || i.updatedAt || 0),
      version: Number(i.version || 0),
      deleted: !!(i.deleted),
      deleted_at: Number(i.deleted_at || i.deletedAt || 0),
      category: i.category,
      type: i.type
    }));

    const normalizedLocal = normalize(currentRawItems);
    const normalizedRemote = normalize(remotePayload?.items || []);

    // 執行 LWW 合併
    let mergedItems = ConflictResolver.resolveLWW(normalizedLocal, normalizedRemote);
    
    // [PAC 智慧去重]：基於安全唯一識別碼 (ID) 進行合併去重，防止因服務名稱重複或空使用者名稱導致的資料遺失與墓碑遺失
    const dedupeMap = new Map<string, VaultItem>();
    for (const item of mergedItems) {
      const key = item.id;
      const existing = dedupeMap.get(key);
      if (!existing || Number(item.updated_at || 0) > Number(existing.updated_at || 0) || (item.version || 0) > (existing.version || 0)) {
        dedupeMap.set(key, item);
      }
    }
    mergedItems = Array.from(dedupeMap.values());

    // [PAC 自癒去重]：舊版 CSV 匯出未保留 id，或跨鹽值錯誤同步後，雲端可能同時存在
    // 同一服務/帳號的一份可解密副本與一份不可解密副本。同步前先清掉不可解密副本，
    // 避免重裝設備拉回後出現大量「解密失敗」。
    const decryptability = new Map<string, boolean>();
    await Promise.all(mergedItems.map(async item => {
      decryptability.set(item.id, await (this.vaultManager as any).canDecryptRawItem?.(item));
    }));

    const signatureMap = new Map<string, VaultItem>();
    const chooseBetterDuplicate = (current: VaultItem, candidate: VaultItem): VaultItem => {
      const currentCanDecrypt = decryptability.get(current.id) !== false;
      const candidateCanDecrypt = decryptability.get(candidate.id) !== false;
      if (candidateCanDecrypt !== currentCanDecrypt) return candidateCanDecrypt ? candidate : current;

      const currentVersion = Number(current.version || 0);
      const candidateVersion = Number(candidate.version || 0);
      if (candidateVersion !== currentVersion) return candidateVersion > currentVersion ? candidate : current;

      const currentTime = Number(current.updated_at || 0);
      const candidateTime = Number(candidate.updated_at || 0);
      return candidateTime > currentTime ? candidate : current;
    };

    for (const item of mergedItems) {
      if (item.deleted) continue;
      const itemType = item.type || (item.category ? 'PASSWORD' : 'PASSWORD');
      const signature = [
        itemType,
        (item.service_name || '').trim().toLowerCase(),
        (item.username || '').trim().toLowerCase()
      ].join('|');
      const existing = signatureMap.get(signature);
      signatureMap.set(signature, existing ? chooseBetterDuplicate(existing, item) : item);
    }

    const activeIdsBeforeSignatureDedupe = new Set(mergedItems.filter(item => !item.deleted).map(item => item.id));
    const keptActiveIds = new Set(Array.from(signatureMap.values()).map(item => item.id));
    mergedItems = mergedItems.filter(item => item.deleted || keptActiveIds.has(item.id));
    const discardedActiveIds = Array.from(activeIdsBeforeSignatureDedupe).filter(id => !keptActiveIds.has(id));
    for (const discardedId of discardedActiveIds) {
      if (currentRawItems.some(item => item.id === discardedId && !item.deleted)) {
        await this.vaultManager.hardDeleteRaw(discardedId);
      }
    }

    // 4. 資料完整性校驗 (雙向安全熔斷機制)
    const getUniqueCount = (items: VaultItem[]) => new Set(items.filter(i => !i.deleted).map(i => `${(i.service_name || '').toLowerCase()}|${(i.username || '').toLowerCase()}`)).size;
    const localUniqueCount = getUniqueCount(normalizedLocal);
    const remoteUniqueCount = getUniqueCount(normalizedRemote);
    const mergedUniqueCount = getUniqueCount(mergedItems);
    
    // a. 本地數據防流失校驗
    if (localUniqueCount > 0 && mergedUniqueCount < localUniqueCount) {
       throw new Error(`Data integrity check failed: Potential loss of unique local entries (${localUniqueCount} -> ${mergedUniqueCount})`);
    }

    // b. 雲端防空覆蓋校驗：當本地資料為空，且雲端原本有資料時，若合併結果低於雲端筆數，強制中斷同步防範清空
    if (localUniqueCount === 0 && remoteUniqueCount > 0 && mergedUniqueCount < remoteUniqueCount) {
      throw new Error(`Safety halt: Attempting to overwrite a populated cloud vault (${remoteUniqueCount} items) from an empty client. Sync aborted to prevent data loss.`);
    }

    // 5. 判斷並寫入本地
    const itemsToSaveLocally = mergedItems.filter(mergedItem => {
      const local = localItems.find(l => l.id === mergedItem.id);
      if (!local) {
        // [PAC 優化]：如果本地沒有這個檔案，且雲端說它已經刪除，那我們本地也根本不用儲存這個墓碑！
        if (mergedItem.deleted) return false;
        return true;
      }
      if (mergedItem.version > local.version) return true;
      if (mergedItem.version === local.version && Number(mergedItem.updated_at || 0) > Number(local.updated_at || 0)) return true;
      return false;
    });

    if (itemsToSaveLocally.length > 0) {
      await this.vaultManager.saveBatchRaw(itemsToSaveLocally);
    }

    // [PAC 優化]：清理本地已經成功同步到雲端的墓碑 (Hard Delete)
    // 當本地有墓碑，且雲端也已經確認接收該墓碑 (雲端版本 >= 本地版本) 時，本地的墓碑使命已達，可以物理刪除。
    const tombstonesToClean = localItems.filter(l => l.deleted);
    for (const tombstone of tombstonesToClean) {
      const remote = normalizedRemote.find(r => r.id === tombstone.id);
      // 若雲端有此墓碑且版本已跟上，代表同步成功，可以安全清除本地紀錄
      if (remote && remote.deleted && remote.version >= (tombstone.version || 0)) {
        await this.vaultManager.hardDeleteRaw(tombstone.id);
      }
    }

    // 6. 推送合併結果至雲端 (包含 License 狀態)
    const localLicense = await (this.vaultManager as any).getLicenseInfo?.();
    const finalTier = (localLicense?.updatedAt || 0) >= (remotePayload?.licenseUpdatedAt || 0) ? localLicense?.tier : remotePayload?.licenseTier;
    const finalTime = Math.max(localLicense?.updatedAt || 0, remotePayload?.licenseUpdatedAt || 0);

    // 合併分類 (LWW)
    let finalCats = localCategories;
    let finalCatsTime = localCategoriesUpdatedAt;
    let categoriesUpdatedInternally = false;
    
    if (remotePayload?.categories && (remotePayload.categoriesUpdatedAt || 0) > finalCatsTime) {
      finalCats = remotePayload.categories;
      finalCatsTime = remotePayload.categoriesUpdatedAt || 0;
      categoriesUpdatedInternally = true;
    }

    await this.syncProvider.pushData({
      salt: localSalt || '',
      items: mergedItems,
      licenseTier: finalTier,
      licenseUpdatedAt: finalTime,
      categories: finalCats,
      categoriesUpdatedAt: finalCatsTime
    });

    // 7. 獲取帳號資訊
    let remoteAccount = 'Unknown';
    if (this.syncProvider.getUserInfo) {
      const userInfo = await this.syncProvider.getUserInfo();
      if (userInfo) remoteAccount = userInfo.email;
    }

    return {
      active: mergedItems.filter(i => !i.deleted).length,
      deleted: mergedItems.filter(i => i.deleted).length,
      pushed: mergedItems.length,
      pulled: normalizedRemote.length,
      remoteItemCount: mergedItems.filter(i => !i.deleted).length,
      conflictsResolved: itemsToSaveLocally.length,
      remoteLicenseTier: finalTier,
      remoteLicenseUpdatedAt: finalTime,
      remoteAccount,
      mergedCategories: categoriesUpdatedInternally ? finalCats : undefined,
      mergedCategoriesUpdatedAt: categoriesUpdatedInternally ? finalCatsTime : undefined
    };
  }

  /**
   * 獲取雲端原始資料 (用於診斷或手動對齊)
   */
  public async getRemoteData() {
    await this.syncProvider.authenticate(false);
    return await this.syncProvider.pullData();
  }

  /**
   * 強制將數據集同步到雲端 (不進行合併，用於抹除或覆蓋)
   */
  public async forceSyncCloud(items: VaultItem[]): Promise<void> {
    PrivacyAuditor.logAccess('SyncEngine', `PAC: Force syncing ${items.length} items to cloud (Overwrite mode)`);
    await this.syncProvider.authenticate(true);
    
    const localSalt = await (this.vaultManager as any).getSalt();
    const licenseInfo = await (this.vaultManager as any).getLicenseInfo?.();

    await this.syncProvider.pushData({
      salt: localSalt || '',
      items,
      licenseTier: licenseInfo?.tier,
      licenseUpdatedAt: licenseInfo?.updatedAt || Date.now(),
      isWiped: items.length === 0
    });
  }
}
