package com.drbarret.privatevault

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class VaultBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val PREFS_NAME = "VaultAutofillPrefs"
    private val KEY_NAME = "VaultAutofillKey"
    private val DATA_KEY = "encrypted_credentials"
    private val IV_KEY = "crypto_iv"

    override fun getName(): String {
        return "VaultBridge"
    }

    private fun getSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        if (!keyStore.containsAlias(KEY_NAME)) {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                KEY_NAME,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
            keyGenerator.init(keyGenParameterSpec)
            return keyGenerator.generateKey()
        }
        return keyStore.getKey(KEY_NAME, null) as SecretKey
    }

    @ReactMethod
    fun syncCredentials(jsonString: String, promise: Promise) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val secretKey = getSecretKey()
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            
            val iv = cipher.iv
            val encryptedBytes = cipher.doFinal(jsonString.toByteArray(Charsets.UTF_8))
            
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(DATA_KEY, Base64.encodeToString(encryptedBytes, Base64.DEFAULT))
                .putString(IV_KEY, Base64.encodeToString(iv, Base64.DEFAULT))
                .apply()
                
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SYNC_ERROR", e)
        }
    }

    @ReactMethod
    fun clearCredentials(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove(DATA_KEY).remove(IV_KEY).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", e)
        }
    }

    @ReactMethod
    fun openAutofillSettings(promise: Promise) {
        try {
            val intent = android.content.Intent(android.provider.Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE)
            intent.data = android.net.Uri.parse("package:" + reactApplicationContext.packageName)
            intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val intent = android.content.Intent(android.provider.Settings.ACTION_SETTINGS)
                intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                reactApplicationContext.startActivity(intent)
                promise.resolve(false)
            } catch (ex: Exception) {
                promise.reject("OPEN_SETTINGS_ERROR", ex)
            }
        }
    }
}
