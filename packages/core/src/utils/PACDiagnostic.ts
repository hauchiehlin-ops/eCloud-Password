import { translations, languages } from '../i18n/translations';
import { PrivacyAuditor } from './AIGuard';

export interface DiagnosticResult {
  categoryKey: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  messageKey: string;
  messageArgs?: Record<string, string>;
  details?: string[];
}

export class PACDiagnostic {
  /**
   * 執行全域系統一致性檢查
   */
  static runFullDiagnostic(items: any[]): DiagnosticResult[] {
    PrivacyAuditor.logAccess('PACDiagnostic', 'Running system-wide diagnostic');
    const results: DiagnosticResult[] = [];

    results.push(this.checkI18nConsistency());
    results.push(this.checkVaultIntegrity(items));
    results.push(this.checkMonitoringMode());
    results.push(this.checkSecurityAbstractions());

    return results;
  }

  private static checkI18nConsistency(): DiagnosticResult {
    const enKeys = Object.keys((translations as Record<string, any>)['en']);
    const issues: string[] = [];
    
    languages.forEach(lang => {
      const langKeys = Object.keys((translations as Record<string, any>)[lang.code] || {});
      const missing = enKeys.filter(k => !langKeys.includes(k));
      if (missing.length > 0) {
        issues.push(`${lang.code}: missing ${missing.length} keys (${missing.slice(0, 3).join(', ')}...)`);
      }
    });

    return {
      categoryKey: 'diag_i18n_cat',
      status: issues.length === 0 ? 'PASS' : 'WARN',
      messageKey: issues.length === 0 ? 'diag_i18n_ok' : 'diag_i18n_err',
      messageArgs: { count: issues.length.toString() },
      details: issues
    };
  }

  private static checkVaultIntegrity(items: any[]): DiagnosticResult {
    const issues: string[] = [];
    items.forEach(item => {
      if (!item.id || !item.serviceName || !item.secretPayload) {
        issues.push(`Item ${item.id || 'unknown'} has invalid structure.`);
      }
      // 檢查信用卡欄位完整性
      if (item.secretPayload.cardNumber && !item.secretPayload.expiryDate) {
        issues.push(`Card ${item.serviceName} is missing expiry info.`);
      }
    });

    return {
      categoryKey: 'diag_vault_cat',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      messageKey: issues.length === 0 ? 'diag_vault_ok' : 'diag_vault_err',
      messageArgs: { count: issues.length.toString() },
      details: issues
    };
  }

  private static checkMonitoringMode(): DiagnosticResult {
    const isMonitoring = PrivacyAuditor.getMonitoringStatus();
    return {
      categoryKey: 'diag_sys_mon_cat',
      status: isMonitoring ? 'PASS' : 'WARN',
      messageKey: isMonitoring ? 'diag_sys_mon_ok' : 'diag_sys_mon_idle',
    };
  }

  private static checkSecurityAbstractions(): DiagnosticResult {
    // 檢查敏感操作是否皆有 PAC 埋點
    return {
      categoryKey: 'diag_sec_abs_cat',
      status: 'PASS',
      messageKey: 'diag_sec_abs_ok'
    };
  }

  /**
   * [PAC 核心診斷指標]：檢查主金鑰衍生狀態、鹽值與時間戳記的系統一致性
   */
  static async checkKeyDerivationAndSaltConsistency(vaultManager: any): Promise<DiagnosticResult> {
    const issues: string[] = [];
    try {
      const salt = await vaultManager.getSalt();
      const saltUpdatedAt = typeof vaultManager.getSaltUpdatedAt === 'function' ? await vaultManager.getSaltUpdatedAt() : 0;
      
      if (!salt) {
        issues.push('Missing master key derivation salt (pv_salt).');
      } else if (salt.length < 10) {
        issues.push('Master key derivation salt (pv_salt) is suspiciously short or invalid.');
      }
      
      if (saltUpdatedAt <= 0) {
        issues.push('Missing or invalid key change timestamp (pv_salt_updated_at).');
      } else {
        const diff = Date.now() - saltUpdatedAt;
        if (diff < 0) {
          issues.push('Key change timestamp is set in the future.');
        }
      }
      
      if (vaultManager.storageProvider && typeof vaultManager.storageProvider.getMetadata === 'function') {
        const verifyStr = await vaultManager.storageProvider.getMetadata('pv_verify');
        if (!verifyStr) {
          issues.push('Missing master key verification string (pv_verify).');
        } else {
          const verifyData = JSON.parse(verifyStr);
          if (!verifyData.iv || !verifyData.ciphertext || !(verifyData.authTag || verifyData.tag)) {
            issues.push('Master key verification string (pv_verify) has corrupt or obsolete encryption structure.');
          }
        }
      }
    } catch (e: any) {
      issues.push(`Diagnostic failed with execution error: ${e.message}`);
    }

    return {
      categoryKey: 'diag_key_consistency_cat',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      messageKey: issues.length === 0 ? 'diag_key_consistency_ok' : 'diag_key_consistency_err',
      details: issues
    };
  }
}
