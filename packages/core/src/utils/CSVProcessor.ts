import { VaultItem } from '../models/VaultItem';

export interface ImportedCSVItem {
  id?: string;
  serviceName: string;
  username: string;
  secretPayload: Record<string, any>;
  type?: 'PASSWORD' | 'PASSKEY' | 'CARD';
  category?: string;
  categoryName?: string;
  updated_at?: number;
  version?: number;
}

export interface ImportResult {
  items: ImportedCSVItem[];
  count: number;
}

export class CSVProcessor {
  private static readonly FULL_EXPORT_HEADERS = [
    'id',
    'type',
    'name',
    'url',
    'username',
    'password',
    'totpSecret',
    'notes',
    'category',
    'categoryName',
    'cardholderName',
    'cardNumber',
    'expiryDate',
    'cvv',
    'brand',
    'updatedAt',
    'version',
    'payloadJson',
  ];

  /**
   * 將保險箱項目導出為完整 CSV 格式。
   * 保留 id/type/category/version/updatedAt 與完整 payload，匯回時才不會被當成新資料重複同步。
   */
  static exportToCSV(items: any[], categories: { id: string; name: string }[] = []): string {
    const categoryNameById = new Map(categories.map(category => [category.id, category.name]));
    const rows = items.map(item => {
      const payload = item.secretPayload || {};
      const type = item.type || (payload.cardNumber ? 'CARD' : 'PASSWORD');
      const categoryName = item.category ? categoryNameById.get(item.category) : '';
      const values = [
        item.id,
        type,
        item.serviceName,
        payload.url || (type === 'PASSWORD' && item.serviceName?.includes('.') ? item.serviceName : ''),
        item.username,
        payload.password,
        payload.totpSecret,
        payload.notes,
        item.category,
        categoryName,
        payload.cardholderName,
        payload.cardNumber,
        payload.expiryDate,
        payload.cvv,
        payload.brand,
        item.updatedAt,
        item.version,
        JSON.stringify(payload),
      ];
      return values.map(value => this.escapeCSV(value)).join(',');
    }).join('\n');
    return `${this.FULL_EXPORT_HEADERS.join(',')}\n${rows}`;
  }

  /**
   * 解析 CSV 資料 (支援 Chrome, 1Password, iOS 格式)
   */
  static parseCSV(csvText: string): ImportedCSVItem[] {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headerRow = this.splitCSVRow(lines[0]);
    const normalizedHeaders = headerRow.map(h => h.trim().toLowerCase());
    const rows = lines.slice(1);
    const results: any[] = [];

    const findIndex = (...candidates: string[]) => normalizedHeaders.findIndex(header =>
      candidates.some(candidate => header === candidate || header.includes(candidate))
    );

    const idx = {
      id: findIndex('id'),
      type: findIndex('type'),
      name: findIndex('name', 'title'),
      user: findIndex('username', 'user'),
      pass: findIndex('password', 'pass'),
      totp: findIndex('totpsecret', 'totp', 'otp'),
      url: findIndex('url', 'website'),
      notes: findIndex('notes', 'note'),
      category: findIndex('category', 'cat'),
      categoryName: findIndex('categoryname', 'category name'),
      cardholderName: findIndex('cardholdername', 'cardholder'),
      cardNumber: findIndex('cardnumber', 'card number'),
      expiryDate: findIndex('expirydate', 'expiry', 'expiration'),
      cvv: findIndex('cvv', 'cvc'),
      brand: findIndex('brand'),
      updatedAt: findIndex('updatedat', 'updated_at', 'updated'),
      version: findIndex('version'),
      payloadJson: findIndex('payloadjson', 'payload_json', 'secretpayload'),
    };

    rows.forEach(row => {
      if (!row.trim()) return;
      const cols = this.splitCSVRow(row);
      if (cols.length < 2) return;

      const get = (index: number) => index >= 0 ? (cols[index] || '') : '';
      const serviceName = get(idx.name) || get(idx.url) || 'Imported Entry';
      const username = get(idx.user) || get(idx.cardholderName) || '';
      const explicitType = get(idx.type).toUpperCase();
      const isCard = explicitType === 'CARD' || !!get(idx.cardNumber);

      let payload: Record<string, any> = {};
      const payloadJson = get(idx.payloadJson);
      if (payloadJson) {
        try {
          const parsed = JSON.parse(payloadJson);
          if (parsed && typeof parsed === 'object') payload = parsed;
        } catch {}
      }

      if (isCard) {
        payload = {
          ...payload,
          cardholderName: get(idx.cardholderName) || payload.cardholderName || username,
          cardNumber: get(idx.cardNumber) || payload.cardNumber,
          expiryDate: get(idx.expiryDate) || payload.expiryDate,
          cvv: get(idx.cvv) || payload.cvv,
          brand: get(idx.brand) || payload.brand,
          notes: get(idx.notes) || payload.notes,
        };
      } else {
        payload = {
          ...payload,
          password: get(idx.pass) || payload.password,
          totpSecret: get(idx.totp) || payload.totpSecret,
          url: get(idx.url) || payload.url,
          notes: get(idx.notes) || payload.notes,
        };
      }

      const hasSecret = isCard ? !!payload.cardNumber : !!payload.password;
      if (serviceName && hasSecret) {
        results.push({
          id: get(idx.id) || undefined,
          serviceName,
          username,
          secretPayload: payload,
          type: isCard ? 'CARD' : 'PASSWORD',
          category: get(idx.category) || undefined,
          categoryName: get(idx.categoryName) || undefined,
          updated_at: Number(get(idx.updatedAt)) || Date.now(),
          version: Number(get(idx.version)) || 1,
        });
      }
    });

    return results;
  }

  private static escapeCSV(val: any): string {
    if (val === undefined || val === null) return '';
    val = String(val);
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  private static splitCSVRow(row: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i+1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
