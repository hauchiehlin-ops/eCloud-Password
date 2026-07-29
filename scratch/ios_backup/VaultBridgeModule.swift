import Foundation
import CryptoKit
import React
import UIKit
import AuthenticationServices

@objc(VaultBridge)
class VaultBridge: NSObject {
    
    // 定義 App Group 的 ID，必須與 Xcode 中設定的 App Groups 一致
    let suiteName = "group.com.drbarret.privatevault"
    let keyName = "vault_autofill_data"
    
    // 固定的對稱加密金鑰
    private var symmetricKey: SymmetricKey {
        let keyString = "com.drbarret.privatevault.autofill.secret.key.2026"
        let keyData = keyString.data(using: .utf8)!
        let hash = SHA256.hash(data: keyData)
        return SymmetricKey(data: hash)
    }
    
    @objc
    func syncCredentials(_ jsonString: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            reject("SYNC_ERROR", "Failed to access App Group UserDefaults. Check your App Group capabilities.", NSError(domain: "VaultBridge", code: 1, userInfo: nil))
            return
        }
        
        do {
            guard let data = jsonString.data(using: .utf8) else {
                reject("SYNC_ERROR", "Failed to convert JSON string to Data", NSError(domain: "VaultBridge", code: 2, userInfo: nil))
                return
            }
            // 使用 CryptoKit 進行 AES-GCM 加密
            let sealedBox = try AES.GCM.seal(data, using: symmetricKey)
            guard let encryptedData = sealedBox.combined else {
                reject("SYNC_ERROR", "Failed to combine encrypted data", NSError(domain: "VaultBridge", code: 3, userInfo: nil))
                return
            }
            
            // 轉為 Base64 儲存於 App Group UserDefaults
            defaults.set(encryptedData.base64EncodedString(), forKey: keyName)
            defaults.synchronize()
            
            // 同步推送至 iOS 系統鍵盤建議列 (ASCredentialIdentityStore)
            syncCredentialIdentityStore(jsonString: jsonString)
            
            resolve(true)
        } catch {
            reject("SYNC_ERROR", "CryptoKit encryption failed: \(error.localizedDescription)", error)
        }
    }
    
    @objc
    func clearCredentials(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            reject("CLEAR_ERROR", "Failed to access App Group UserDefaults", NSError(domain: "VaultBridge", code: 4, userInfo: nil))
            return
        }
        
        defaults.removeObject(forKey: keyName)
        defaults.synchronize()
        
        // 清除系統鍵盤建議列
        ASCredentialIdentityStore.shared.removeAllCredentialIdentities { success, error in
            if let error = error {
                print("[CloudPassword] Failed to clear credential store: \(error.localizedDescription)")
            }
        }
        
        resolve(true)
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func openAutofillSettings(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let url = URL(string: "App-Prefs:PASSWORDS") {
            DispatchQueue.main.async {
                UIApplication.shared.open(url, options: [:]) { success in
                    if success {
                        resolve(true)
                    } else {
                        if let fallbackUrl = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(fallbackUrl, options: [:]) { _ in
                                resolve(false)
                            }
                        } else {
                            resolve(false)
                        }
                    }
                }
            }
        } else {
            resolve(false)
        }
    }

    // MARK: - ASCredentialIdentityStore Sync (系統級鍵盤建議)

    @objc
    func refreshCredentialStore(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let base64String = defaults.string(forKey: keyName),
              let encryptedData = Data(base64Encoded: base64String) else {
            resolve(false)
            return
        }

        do {
            let sealedBox = try AES.GCM.SealedBox(combined: encryptedData)
            let decryptedData = try AES.GCM.open(sealedBox, using: symmetricKey)
            if let jsonString = String(data: decryptedData, encoding: .utf8) {
                syncCredentialIdentityStore(jsonString: jsonString)
                resolve(true)
            } else {
                resolve(false)
            }
        } catch {
            print("[CloudPassword] Decryption for store sync failed: \(error)")
            resolve(false)
        }
    }

    private func syncCredentialIdentityStore(jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return
        }

        var identities: [ASPasswordCredentialIdentity] = []

        for cred in json {
            let type = (cred["type"] as? String) ?? "PASSWORD"
            if type == "CARD" { continue } // 鍵盤列僅支援帳密

            guard let username = cred["username"] as? String,
                  let id = cred["id"] as? String,
                  !username.isEmpty else { continue }

            let urlString = (cred["url"] as? String) ?? ""
            let serviceName = (cred["serviceName"] as? String) ?? "CloudPassword"
            let domain = extractDomain(from: urlString) ?? serviceName.replacingOccurrences(of: " ", with: "").lowercased()

            // 必須包含合法的網域以供系統在對應網頁建議帳密
            let serviceIdentifier = ASCredentialServiceIdentifier(identifier: domain, type: .domain)
            let identity = ASPasswordCredentialIdentity(
                serviceIdentifier: serviceIdentifier,
                user: username,
                recordIdentifier: id
            )
            identities.append(identity)
        }

        // 全量同步更新系統認證庫
        ASCredentialIdentityStore.shared.getState { state in
            if state.isEnabled {
                ASCredentialIdentityStore.shared.saveCredentialIdentities(identities) { success, error in
                    if let error = error {
                        print("[CloudPassword] Failed to save credential identities: \(error.localizedDescription)")
                    } else {
                        print("[CloudPassword] Successfully synced \(identities.count) credentials to system.")
                    }
                }
            } else {
                print("[CloudPassword] System Autofill is disabled, skipping identity store sync.")
            }
        }
    }

    private func extractDomain(from urlString: String) -> String? {
        var s = urlString.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if let range = s.range(of: "://") { s = String(s[range.upperBound...]) }
        if s.hasPrefix("www.") { s = String(s.dropFirst(4)) }
        if let slashIdx = s.firstIndex(of: "/") { s = String(s[..<slashIdx]) }
        if let queryIdx = s.firstIndex(of: "?") { s = String(s[..<queryIdx]) }
        if let colonIdx = s.firstIndex(of: ":") { s = String(s[..<colonIdx]) }
        return s.isEmpty ? nil : s
    }
}
