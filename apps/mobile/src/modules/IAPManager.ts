import { Platform } from 'react-native';
import { 
  initConnection, 
  endConnection, 
  fetchProducts, 
  requestPurchase, 
  finishTransaction,
  acknowledgePurchaseAndroid,
  Product,
  Purchase,
  purchaseUpdatedListener,
  purchaseErrorListener
} from 'react-native-iap';
import * as SecureStore from 'expo-secure-store';

const itemSkus = Platform.select({
  ios: ['com.cloudpassword.pro', 'com.cloudpassword.lifetime'],
  android: ['com.cloudpassword.pro', 'com.cloudpassword.lifetime'],
}) || [];

export class IAPManager {
  private static isInitialized = false;
  private static isServiceAvailable = true;
  private static purchaseUpdateSubscription: any = null;
  private static purchaseErrorSubscription: any = null;
  private static onPurchaseSuccessCallback: (() => void) | null = null;

  public static async init(onPurchaseSuccess?: () => void): Promise<void> {
    if (onPurchaseSuccess) {
      this.onPurchaseSuccessCallback = onPurchaseSuccess;
    }
    if (this.isInitialized) return;
    
    if (Platform.OS === 'android' && !this.isServiceAvailable) {
      console.log('🛡️ [IAP] Billing service previously marked as unavailable, attempting reconnect...');
      // We should allow retry in case it was a transient startup failure
    }

    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const isIapError = args.some(arg => 
        typeof arg === 'string' && (arg.includes('[RN-IAP]') || arg.includes('IAP connection'))
      );
      if (!isIapError) {
        originalConsoleError(...args);
      } else {
        console.warn(...args);
      }
    };

    try {
      await initConnection();
      this.isInitialized = true;
      this.isServiceAvailable = true;
      console.log('🛡️ [IAP] Connection initialized');
    } catch (err: any) {
      const isEmulatorError = err.message?.toLowerCase().includes('billing') || 
                             err.message?.toLowerCase().includes('connection') ||
                             err.code === 'E_IAP_NOT_AVAILABLE';

      if (isEmulatorError) {
        console.log('🛡️ [IAP] Billing services not available (likely an emulator or missing Play Store)');
        // Don't mark as permanently initialized/failed so we can retry if needed
        this.isInitialized = false;
        this.isServiceAvailable = false;
      } else {
        console.log('🛡️ [IAP] Initialization non-fatal warning:', err.message);
        this.isInitialized = true;
        this.isServiceAvailable = true;
      }
    } finally {
      console.error = originalConsoleError;
    }
    if (this.isInitialized) {
      this.setupListeners();
    }
  }

  private static setupListeners(): void {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }

    this.purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: any) => {
      console.log('🛡️ [IAP] purchaseUpdatedListener triggered', purchase);
      const receipt = purchase.transactionReceipt;
      if (receipt) {
        try {
          if (Platform.OS === 'ios') {
            await finishTransaction({ purchase });
          } else if (Platform.OS === 'android') {
            await acknowledgePurchaseAndroid(purchase.purchaseToken!);
          }
          
          const sku = purchase.productId;
          await SecureStore.setItemAsync('pv_license_tier', sku.includes('lifetime') ? 'lifetime' : 'pro');
          await SecureStore.setItemAsync('pv_license_updated_at', Date.now().toString());
          
          if (this.onPurchaseSuccessCallback) {
            this.onPurchaseSuccessCallback();
          }
        } catch (err) {
          console.warn('❌ [IAP] finishTransaction error', err);
        }
      }
    });

    this.purchaseErrorSubscription = purchaseErrorListener((error) => {
      console.warn('❌ [IAP] purchaseErrorListener', error);
    });
  }

  public static async getProducts(): Promise<Product[]> {
    if (!this.isServiceAvailable) {
      console.log('🛡️ [IAP] Service unavailable, returning empty products.');
      return [];
    }
    
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      
      if (!this.isServiceAvailable) return [];
      
      console.log('🛡️ [IAP] Fetching products for SKUs:', itemSkus);
      
      // Add a small delay for Android to ensure service connection settles
      if (Platform.OS === 'android') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const results = await fetchProducts({ skus: itemSkus });
      return (results || []) as Product[];
    } catch (err: any) {
      console.warn('❌ [IAP] Get products error', err);
      // If disconnected, try once more after a short delay
      if (err.message?.includes('disconnected') || err.message?.includes('initialized')) {
        this.isInitialized = false;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.init();
        try {
          const retryResults = await fetchProducts({ skus: itemSkus });
          return (retryResults || []) as Product[];
        } catch (retryErr) {
          console.warn('❌ [IAP] Retry get products failed', retryErr);
        }
      }
      return [];
    }
  }

  public static async requestPurchase(sku: string): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        console.log('🛡️ [IAP] Not initialized before purchase, initializing now...');
        await this.init();
      }

      // v15 requires skus array for some calls, but requestPurchase usually takes sku
      const purchase = await (requestPurchase as any)({ 
        sku: sku,
        skus: [sku],
        andSkus: [sku] // Fallback for some Android versions
      });
      console.log('🛡️ [IAP] Purchase request successful', purchase);
      
      await SecureStore.setItemAsync('pv_license_tier', sku.includes('lifetime') ? 'lifetime' : 'pro');
      
      const p = Array.isArray(purchase) ? purchase[0] : purchase;
      if (!p) return false;
      if (Platform.OS === 'ios') {
        await finishTransaction({ purchase: p as Purchase });
      } else if (Platform.OS === 'android') {
        await acknowledgePurchaseAndroid(p.purchaseToken!);
      }
      
      return true;
    } catch (err) {
      console.warn('❌ [IAP] Purchase error', err);
      throw err;
    }
  }

  public static async getStoredTier(): Promise<{ tier: string; updatedAt: number }> {
    const tier = (await SecureStore.getItemAsync('pv_license_tier')) || 'trial';
    const updatedStr = await SecureStore.getItemAsync('pv_license_updated_at');
    return { 
      tier, 
      updatedAt: updatedStr ? parseInt(updatedStr, 10) : 0 
    };
  }

  public static async setStoredTier(tier: string, updatedAt?: number): Promise<void> {
    await SecureStore.setItemAsync('pv_license_tier', tier);
    await SecureStore.setItemAsync('pv_license_updated_at', (updatedAt || Date.now()).toString());
  }

  public static async endConnection(): Promise<void> {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }
    if (this.isInitialized) {
      await endConnection();
      this.isInitialized = false;
    }
  }
}
