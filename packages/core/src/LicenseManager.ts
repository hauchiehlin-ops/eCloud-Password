export type LicenseTier = 'trial' | 'expired' | 'pro' | 'lifetime';

export interface LicenseStatus {
  tier: LicenseTier;
  expiryDate?: number; // Timestamp
  trialStartedAt: number; // Timestamp
  isAdvancedAIEnabled: boolean;
  isRealtimePACEnabled: boolean;
  isAutoSyncEnabled: boolean;
  maxEntries: number;
}

export class LicenseManager {
  // 實機試用版本特判：開放全功能 pro 版本，不要有 14 天試用限制。待正式上架審核前，將此值改回 false。
  public static readonly IS_TRIAL_VERSION_FREE_PRO = false;

  private static config = {
    TRIAL_DAYS: 14,
    TRIAL_MAX_ENTRIES: 10
  };

  static setConfig(newConfig: Partial<typeof LicenseManager.config>) {
    this.config = { ...this.config, ...newConfig };
  }

  static getStatus(
    tier: LicenseTier,
    trialStartedAt: number,
    currentEntryCount: number
  ): LicenseStatus {
    const now = Date.now();
    const trialExpiry = trialStartedAt + this.config.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    
    let currentTier = tier;
    
    if (this.IS_TRIAL_VERSION_FREE_PRO) {
      currentTier = 'pro';
    } else {
      if (tier === 'trial' && now > trialExpiry) {
        currentTier = 'expired';
      }
    }

    const isPaid = currentTier === 'pro' || currentTier === 'lifetime';
    const isActiveTrial = currentTier === 'trial';

    return {
      tier: currentTier,
      expiryDate: currentTier === 'pro' ? undefined : trialExpiry,
      trialStartedAt,
      isAdvancedAIEnabled: isPaid || isActiveTrial,
      isRealtimePACEnabled: isPaid || isActiveTrial,
      isAutoSyncEnabled: isPaid || isActiveTrial,
      maxEntries: (isPaid || isActiveTrial) ? Infinity : this.config.TRIAL_MAX_ENTRIES,
    };
  }

  static canAddMore(currentCount: number, status: LicenseStatus): boolean {
    return currentCount < status.maxEntries;
  }
}
