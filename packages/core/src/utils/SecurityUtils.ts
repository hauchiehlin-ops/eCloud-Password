/**
 * Cloud Password 核心圖示庫 (SVG)
 * 提供一致的工業、科技感視覺系統
 */
export const Icons = {
  Vault: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  Key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3m-3-3l-2.5-2.5"></path></svg>`,
  Settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  Shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  Database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
  Warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  Check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  Activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,
};

/**
 * TOTP 產生器 (基於 HMAC-SHA1)
 * 支援 30 秒倒數與 6 位數代碼
 */
export class TOTPHelper {
  static generate(secret: string): { code: string; secondsLeft: number } {
    // 這裡實作簡易 TOTP 邏輯 (RFC 6238)
    // 實務上會使用更完整的 lib，此處先提供架構介面
    const time = Math.floor(Date.now() / 1000);
    const secondsLeft = 30 - (time % 30);
    
    // 模擬產生代碼 (稍後會串接真正的 HMAC 實作)
    const mockCode = Math.floor(Math.random() * 900000 + 100000).toString();
    return { code: mockCode, secondsLeft };
  }
}

/**
 * Watchtower 安全分析引擎
 */
export class Watchtower {
  static analyzeVault(items: any[]): { 
    score: number, 
    weak: number, 
    reused: number, 
    compromised: number 
  } {
    if (items.length === 0) return { score: 100, weak: 0, reused: 0, compromised: 0 };
    
    let weak = 0;
    let reused = 0;
    const pwdCounts: Record<string, number> = {};

    items.forEach(item => {
      const pwd = item.secretPayload.password || '';
      if (pwd.length < 10) weak++;
      pwdCounts[pwd] = (pwdCounts[pwd] || 0) + 1;
    });

    Object.values(pwdCounts).forEach(count => {
      if (count > 1) reused += count;
    });

    // 改良版評分公式：根據比例扣分，而非絕對值
    const weakPenalty = (weak / items.length) * 50;
    const reusedPenalty = (reused / items.length) * 40;
    const score = Math.floor(Math.max(0, 100 - weakPenalty - reusedPenalty));
    
    return { score, weak, reused, compromised: 0 };
  }

  /**
   * 檢查密碼是否在外洩資料庫中 (HIBP K-Anonymity)
   */
  static async checkBreach(password: string): Promise<{ isPwned: boolean; count: number }> {
    try {
      const sha1 = await this.sha1(password);
      const prefix = sha1.substring(0, 5).toUpperCase();
      const suffix = sha1.substring(5).toUpperCase();

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      const text = await response.text();
      
      const lines = text.split('\n');
      for (const line of lines) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix.trim() === suffix) {
          return { isPwned: true, count: parseInt(count) };
        }
      }
      return { isPwned: false, count: 0 };
    } catch (e) {
      console.warn("🛡️ [HIBP] Breach check failed", e);
      return { isPwned: false, count: 0 };
    }
  }

  private static async sha1(str: string): Promise<string> {
    try {
      // Check if crypto.subtle exists (Web/Extension)
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      
      // For Mobile, we currently skip native SHA-1 to avoid circular dependencies in core.
      // The breach check will be skipped if native crypto is not available.
      throw new Error('Web Crypto API not available');
    } catch (e) {
      return ''; // Graceful failure
    }
  }

  /**
   * 產生 AI 安全建議 (返回 i18n 鍵值)
   */
  static getAIInsights(items: any[]): any[] {
    const insights = [];
    const stats = this.analyzeVault(items);

    if (stats.weak > 0) {
      insights.push({
        id: 'weak_pwd',
        titleKey: 'ai_weak_title',
        descKey: 'ai_weak_desc',
        recommendKey: 'ai_weak_fix',
        severity: 'HIGH',
        count: stats.weak
      });
    }

    if (stats.reused > 0) {
      insights.push({
        id: 'reused_pwd',
        titleKey: 'ai_reused_title',
        descKey: 'ai_reused_desc',
        recommendKey: 'ai_reused_fix',
        severity: 'MEDIUM',
        count: stats.reused
      });
    }

    // 模擬：偵測重要帳戶缺乏 2FA
    const sensitiveAccounts = items.filter(i => 
      ['bank', 'google', 'finance', 'crypto', '銀行', '金鑰'].some(k => i.serviceName.toLowerCase().includes(k))
      && !i.secretPayload.totpSecret
    );

    if (sensitiveAccounts.length > 0) {
      insights.push({
        id: 'missing_2fa',
        titleKey: 'ai_2fa_title',
        descKey: 'ai_2fa_desc',
        recommendKey: 'ai_2fa_fix',
        severity: 'CRITICAL',
        count: sensitiveAccounts.length,
        examples: sensitiveAccounts.slice(0, 2).map(a => a.serviceName).join(', ')
      });
    }

    return insights;
  }

  /**
   * 產生 TOTP 驗證碼 (6位數)
   * @param secret Base32 格式的金鑰
   */
  static generateTOTP(secret: string): string {
    if (!secret || secret.trim().length === 0) return '------';
    try {
      const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
      const { TOTP } = require('otpauth');
      const totp = new TOTP({
        secret: cleanSecret,
        digits: 6,
        period: 30
      });
      return totp.generate();
    } catch (e) {
      return 'ERROR';
    }
  }
}

/**
 * 信用卡驗證器 (Luhn Algorithm & Brand Detection)
 */
export class CardValidator {
  /**
   * Luhn 演算法驗證
   */
  static validateLuhn(number: string): boolean {
    const clean = number.replace(/\D/g, '');
    if (clean.length < 13 || clean.length > 19) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = clean.length - 1; i >= 0; i--) {
      let digit = parseInt(clean.charAt(i));
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * 偵測卡片品牌
   */
  static detectBrand(number: string): string {
    const clean = number.replace(/\D/g, '');
    if (/^4/.test(clean)) return 'Visa';
    if (/^5[1-5]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    if (/^35/.test(clean)) return 'JCB';
    return 'Unknown';
  }
}
