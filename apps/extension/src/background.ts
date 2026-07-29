import { VaultManager } from '@private-vault/core';
import { WebCryptoProvider } from './providers/WebCryptoProvider';
import { WebStorageProvider } from './providers/WebStorageProvider';

let sessionKey: Uint8Array | null = null;
const vaultManager = new VaultManager(new WebCryptoProvider(), new WebStorageProvider());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PV_SYNC_SESSION') {
    // Received from Popup when unlocked
    sessionKey = new Uint8Array(Object.values(message.key));
    (vaultManager as any).sessionKey = sessionKey;
    console.log("🛡️ [IAP] Background session synced");
    sendResponse({ success: true });
  }

  if (message.type === 'PV_REQUEST_FILL') {
    if (!sessionKey) {
      sendResponse({ items: [] });
      return true;
    }

    handleFillRequest(message.hostname).then(items => {
      sendResponse({ items });
    });
    return true; // async
  }
});

async function handleFillRequest(hostname: string) {
  try {
    const { items } = await vaultManager.getDecryptedItems();
    const domain = hostname.replace('www.', '').toLowerCase();
    
    // Filter matching accounts
    return items
      .filter((i: any) => i.serviceName.toLowerCase().includes(domain))
      .map((i: any) => ({
        serviceName: i.serviceName,
        username: i.username,
        password: i.secretPayload.password
      }));
  } catch (e) {
    return [];
  }
}
