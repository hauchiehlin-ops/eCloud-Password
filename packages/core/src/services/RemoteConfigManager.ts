import { LicenseManager } from '../LicenseManager';

export interface AppRemoteConfig {
  trialDays: number;
  maxFreeEntries: number;
  promoBannerText: string;
  updateRequired: boolean;
  minVersion: string;
}

export class RemoteConfigManager {
  private static CONFIG_URL = "https://drbarretlin-code.github.io/cloud-password/config.json";

  static async fetchAndApply() {
    try {
      // Mock fetch for now. In production, this would be a real network call.
      const response = await fetch(this.CONFIG_URL).catch(() => null);
      
      if (response && response.ok) {
        const config: AppRemoteConfig = await response.json();
        
        // Apply to LicenseManager
        LicenseManager.setConfig({
          TRIAL_DAYS: config.trialDays,
          TRIAL_MAX_ENTRIES: config.maxFreeEntries
        });

        return config;
      }
    } catch (error) {
      console.warn("PAC: Failed to fetch remote config, using defaults.", error);
    }
    return null;
  }
}
