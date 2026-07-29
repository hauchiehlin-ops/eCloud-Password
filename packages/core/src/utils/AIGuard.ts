import { VaultItem } from '../models/VaultItem';

export interface SecurityAdvice {
  id: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  titleKey: string;
  descriptionKey: string;
  count?: number;
  examples?: string;
}

export interface DecryptedVaultItem {
  id: string;
  serviceName: string;
  username: string;
  secretPayload: any;
  updatedAt: number;
  category?: string;
}

export class AIGuard {
  /**
   * 計算保險箱整體安全得分 (0-100)
   */
  static calculateScore(items: DecryptedVaultItem[], compromisedCount: number = 0): { score: number; weak: number; reused: number; compromised: number } {
    if (items.length === 0) return { score: 100, weak: 0, reused: 0, compromised: 0 };
    
    const advice = this.analyzeRisk(items);
    
    const weakAdvice = advice.find(a => a.id === 'weak-summary');
    const reusedAdvice = advice.find(a => a.id === 'reused-summary');

    const weakCount = weakAdvice?.count || 0;
    const reusedCount = reusedAdvice?.count || 0;
    
    let score = 100;
    
    // 扣分機制
    const weakPenalty = (weakCount / items.length) * 40;
    const reusedPenalty = (reusedCount / items.length) * 30;
    const compromisedPenalty = (compromisedCount / items.length) * 100; // 外洩權重最高
    
    score = Math.floor(Math.max(0, 100 - weakPenalty - reusedPenalty - compromisedPenalty));

    return { score, weak: weakCount, reused: reusedCount, compromised: compromisedCount };
  }

  /**
   * 基於本地端的輕量化社交工程風險分析
   */
  static analyzeRisk(items: DecryptedVaultItem[]): SecurityAdvice[] {
    const advice: SecurityAdvice[] = [];
    const sensitiveServices = ['bank', 'crypto', 'exchange', 'finance', 'gov', 'mail', 'aws', 'google', 'apple', 'github'];
    
    // 1. 密碼強度檢查 (摘要)
    const weakItems = items.filter(item => {
      const pwd = item.secretPayload.password || '';
      return pwd.length < 12 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd);
    });

    if (weakItems.length > 0) {
      advice.push({
        id: 'weak-summary',
        level: weakItems.some(i => (i.secretPayload.password || '').length < 8) ? 'CRITICAL' : 'WARNING',
        titleKey: 'ai_weak_title',
        descriptionKey: 'ai_weak_desc',
        count: weakItems.length,
        examples: weakItems.slice(0, 3).map(i => i.serviceName).join(', ')
      });
    }

    // 2. 密碼重複使用檢查 (摘要)
    const reusedMap = new Map<string, string[]>();
    items.forEach(item => {
      const pwd = item.secretPayload.password;
      if (!pwd) return;
      if (!reusedMap.has(pwd)) reusedMap.set(pwd, []);
      reusedMap.get(pwd)!.push(item.serviceName);
    });

    const reusedServicesSet = new Set<string>();
    reusedMap.forEach((services) => {
      if (services.length > 1) {
        services.forEach(s => reusedServicesSet.add(s));
      }
    });

    if (reusedServicesSet.size > 0) {
      advice.push({
        id: 'reused-summary',
        level: 'WARNING',
        titleKey: 'ai_reused_title',
        descriptionKey: 'ai_reused_desc',
        count: reusedServicesSet.size,
        examples: Array.from(reusedServicesSet).slice(0, 3).join(', ')
      });
    }

    // 3. 2FA 缺失檢查
    const missing2FA = items.filter(item => 
      !item.secretPayload.totpSecret && sensitiveServices.some(k => item.serviceName.toLowerCase().includes(k))
    );

    if (missing2FA.length > 0) {
      advice.push({
        id: 'missing-2fa',
        level: 'WARNING',
        titleKey: 'ai_2fa_title',
        descriptionKey: 'ai_2fa_desc',
        count: missing2FA.length,
        examples: missing2FA.slice(0, 3).map(i => i.serviceName).join(', ')
      });
    }

    return advice;
  }

  /**
   * 計算兩個字串的 Levenshtein 距離
   */
  static getLevenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    
    const matrix: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1,      // Insertion
          matrix[i - 1][j - 1] + cost // Substitution
        );
      }
    }
    return matrix[len1][len2];
  }

  /**
   * 計算兩個服務名稱的相似度比例 (0 到 1 之間的浮點數)
   */
  static calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.trim().toLowerCase();
    const s2 = str2.trim().toLowerCase();
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    const maxLen = Math.max(s1.length, s2.length);
    const dist = this.getLevenshteinDistance(s1, s2);
    return (maxLen - dist) / maxLen;
  }

  /**
   * 搜尋並群組化所有服務名稱相似度達特定比例 (如 60%) 且使用者名稱相同的重複項目
   * @param items 已解密的保險箱項目清單
   * @param threshold 相似度閾值 (0.0 到 1.0)
   */
  static findDuplicateGroups(items: DecryptedVaultItem[], threshold: number = 0.60): DuplicateGroup[] {
    const visited = new Set<string>();
    const groups: DuplicateGroup[] = [];

    for (let i = 0; i < items.length; i++) {
      const itemA = items[i];
      if (visited.has(itemA.id)) continue;

      const groupItems: DecryptedVaultItem[] = [itemA];
      const usernameA = (itemA.username || '').trim().toLowerCase();

      for (let j = i + 1; j < items.length; j++) {
        const itemB = items[j];
        if (visited.has(itemB.id)) continue;

        const usernameB = (itemB.username || '').trim().toLowerCase();
        
        // 1. 使用者名稱必須完全相同（忽略空白與大小寫）
        if (usernameA === usernameB) {
          // 2. 計算服務名稱相似度
          const similarity = this.calculateSimilarity(itemA.serviceName, itemB.serviceName);
          if (similarity >= threshold) {
            groupItems.push(itemB);
          }
        }
      }

      // 如果群組內有多於 1 個項目，代表有重複
      if (groupItems.length > 1) {
        groupItems.forEach(item => visited.add(item.id));
        groups.push({
          keyService: itemA.serviceName,
          items: groupItems
        });
      }
    }

    return groups;
  }
}

export interface DuplicateGroup {
  keyService: string;
  items: DecryptedVaultItem[];
}

/**
 * 隱私稽核追蹤 (Zero-Telemetry Audit)
 */
export enum AuditCategory {
  SYSTEM = 'SYSTEM',
  AUTH = 'AUTH',
  DATA = 'DATA',
  SYNC = 'SYNC',
  SECURITY = 'SECURITY'
}

export class PrivacyAuditor {
  private static logs: { timestamp: number; category: AuditCategory; module: string; action: string }[] = [];
  private static isMonitoring: boolean = false;
  private static listeners: ((log: string) => void)[] = [];

  static setMonitoring(enabled: boolean) {
    this.isMonitoring = enabled;
    this.log(AuditCategory.SYSTEM, 'PrivacyAuditor', `Monitoring ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  static getMonitoringStatus(): boolean {
    return this.isMonitoring;
  }

  static log(category: AuditCategory, module: string, action: string) {
    const timestamp = Date.now();
    const entry = { timestamp, category, module, action };
    this.logs.push(entry);
    
    if (this.logs.length > 500) this.logs.shift();

    const formatted = `[${new Date(timestamp).toISOString()}] [${category}] ${module}: ${action}`;
    console.log(`🛡️ [PRIVACY AUDIT] ${formatted}`);
    this.listeners.forEach(cb => cb(formatted));
  }

  // Backwards compatibility for the old logAccess signature
  static logAccess(module: string, action: string) {
    this.log(AuditCategory.DATA, module, action);
  }

  static subscribe(cb: (log: string) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  static getAuditReport(category?: AuditCategory): string[] {
    const filtered = category ? this.logs.filter(l => l.category === category) : this.logs;
    return filtered.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.category}] ${l.module}: ${l.action}`);
  }

  static clearLogs() {
    this.logs = [];
  }
}
