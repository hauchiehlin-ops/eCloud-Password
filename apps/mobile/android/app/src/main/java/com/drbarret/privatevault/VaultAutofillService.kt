package com.drbarret.privatevault

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.*
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class VaultAutofillService : AutofillService() {
    companion object {
        private const val TAG = "CloudPasswordAutofill"
        private const val PREFS_NAME = "VaultAutofillPrefs"
        private const val KEY_NAME = "VaultAutofillKey"
        private const val DATA_KEY = "encrypted_credentials"
        private const val IV_KEY = "crypto_iv"
        const val EXTRA_AUTOFILL_IDS = "autofill_ids_json"
    }

    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        val structure = request.fillContexts.last().structure
        val fillResponseBuilder = FillResponse.Builder()

        // 1. 取得並解密資料
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val encryptedData = prefs.getString(DATA_KEY, null)
        val ivBase64 = prefs.getString(IV_KEY, null)
        if (encryptedData == null || ivBase64 == null) { callback.onSuccess(null); return }

        val jsonString = try { decryptData(encryptedData, ivBase64) }
        catch (e: Exception) { Log.e(TAG, "Decryption failed", e); callback.onSuccess(null); return }

        val credentials = parseJson(jsonString)
        if (credentials.isEmpty()) { callback.onSuccess(null); return }

        // 2. 偵測 UI 結構：找出目標輸入框
        val fields = findAutofillFields(structure)
        if (fields.usernameId == null && fields.passwordId == null) { callback.onSuccess(null); return }

        // 3. 取得當前上下文
        val currentPackage = structure.activityComponent.packageName ?: ""
        val currentDomain = findWebDomain(structure)?.let { normalizeDomain(it) }
        Log.d(TAG, "Context — Package: $currentPackage, Domain: $currentDomain")

        // 4. 分類：精準匹配 vs 其餘
        val matched = mutableListOf<Map<String, String>>()
        val rest    = mutableListOf<Map<String, String>>()

        for (cred in credentials) {
            val url     = cred["url"] ?: ""
            val service = (cred["serviceName"] ?: "").lowercase()
            val credDomain = if (url.isNotBlank()) normalizeDomain(url) else null

            val isMatch = when {
                // domain 精準比對
                currentDomain != null && credDomain != null &&
                        (credDomain == currentDomain ||
                         credDomain.endsWith(".$currentDomain") ||
                         currentDomain.endsWith(".$credDomain")) -> true
                // package name 比對（原生 App）
                currentPackage.isNotBlank() &&
                        (url.contains(currentPackage, ignoreCase = true) ||
                         service.contains(currentPackage.substringAfterLast("."), ignoreCase = true)) -> true
                else -> false
            }

            if (isMatch) matched.add(cred) else rest.add(cred)
        }

        // 5. 建立 Dataset：精準匹配優先，最多顯示 5 筆
        val toShow = (matched + rest).take(5)
        var addedCount = 0

        for (cred in toShow) {
            val type     = cred["type"] ?: "PASSWORD"
            val username = cred["username"] ?: ""
            val password = cred["password"] ?: ""
            val service  = cred["serviceName"] ?: "Cloud Password"

            if (type == "CARD") {
                val cardNum = cred["cardNumber"] ?: ""
                val holder  = cred["cardholderName"] ?: ""
                val last4   = if (cardNum.length >= 4) cardNum.takeLast(4) else cardNum
                val brand   = cred["brand"] ?: "Card"
                val label   = "💳 $brand (****$last4)"

                val presentation = buildPresentation(label)
                val dataset = Dataset.Builder()
                fields.usernameId?.let { dataset.setValue(it, AutofillValue.forText(holder), presentation) }
                fields.passwordId?.let { dataset.setValue(it, AutofillValue.forText(cardNum), presentation) }
                fillResponseBuilder.addDataset(dataset.build())
            } else {
                val isSuggested = matched.contains(cred)
                val label = if (isSuggested) "🔑 $service ($username)" else "$service ($username)"

                val presentation = buildPresentation(label)
                val dataset = Dataset.Builder()
                fields.usernameId?.let { dataset.setValue(it, AutofillValue.forText(username), presentation) }
                fields.passwordId?.let { dataset.setValue(it, AutofillValue.forText(password), presentation) }
                fillResponseBuilder.addDataset(dataset.build())
            }
            addedCount++
        }

        // 6. 加入「搜尋更多」入口（透過 Authentication Intent 開啟 VaultPickerActivity）
        val searchPresentation = buildPresentation("🔍 搜尋 Cloud Password...")
        val pickerIntent = Intent(this, VaultPickerActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            // 傳遞 autofill field IDs 供 VaultPickerActivity 回填
            val ids = ArrayList<AutofillId>()
            fields.usernameId?.let { ids.add(it) }
            fields.passwordId?.let { ids.add(it) }
            putParcelableArrayListExtra("autofill_ids", ids)
            putExtra("is_username_first", fields.usernameId != null)
            putExtra("is_password_present", fields.passwordId != null)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 100, pickerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        val searchDataset = Dataset.Builder()
        fields.usernameId?.let { searchDataset.setValue(it, null, searchPresentation) }
        fields.passwordId?.let { searchDataset.setValue(it, null, searchPresentation) }
        searchDataset.setAuthentication(pendingIntent.intentSender)
        fillResponseBuilder.addDataset(searchDataset.build())

        callback.onSuccess(fillResponseBuilder.build())
    }

    // MARK: - Domain 正規化
    private fun normalizeDomain(raw: String): String {
        return try {
            var s = raw.trim().lowercase()
            if (!s.contains("://")) s = "https://$s"
            val uri = URI(s)
            var host = uri.host ?: s
            if (host.startsWith("www.")) host = host.removePrefix("www.")
            host
        } catch (e: Exception) {
            raw.lowercase().removePrefix("www.").substringBefore("/")
        }
    }

    // MARK: - UI 工具
    private fun buildPresentation(text: String): RemoteViews {
        return RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, text)
        }
    }

    // MARK: - Web Domain 偵測
    private fun findWebDomain(structure: AssistStructure): String? {
        val nodes = mutableListOf<AssistStructure.ViewNode>()
        for (i in 0 until structure.windowNodeCount) {
            nodes.add(structure.getWindowNodeAt(i).rootViewNode)
        }
        while (nodes.isNotEmpty()) {
            val node = nodes.removeAt(0)
            if (!node.webDomain.isNullOrBlank()) return node.webDomain
            for (i in 0 until node.childCount) nodes.add(node.getChildAt(i))
        }
        return null
    }

    // MARK: - 解密
    private fun decryptData(encryptedBase64: String, ivBase64: String): String {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        val secretKey = keyStore.getKey(KEY_NAME, null) as SecretKey
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, Base64.decode(ivBase64, Base64.DEFAULT)))
        return String(cipher.doFinal(Base64.decode(encryptedBase64, Base64.DEFAULT)), Charsets.UTF_8)
    }

    // MARK: - JSON 解析
    private fun parseJson(json: String): List<Map<String, String>> {
        val result = mutableListOf<Map<String, String>>()
        try {
            val arr = org.json.JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val map = mutableMapOf<String, String>()
                val keys = obj.keys()
                while (keys.hasNext()) { val k = keys.next(); map[k] = obj.optString(k) }
                result.add(map)
            }
        } catch (e: Exception) { Log.e(TAG, "JSON parse error", e) }
        return result
    }

    // MARK: - 輸入框偵測
    private data class AutofillFields(var usernameId: AutofillId? = null, var passwordId: AutofillId? = null)

    private fun findAutofillFields(structure: AssistStructure): AutofillFields {
        val result = AutofillFields()
        val nodes = mutableListOf<AssistStructure.ViewNode>()
        for (i in 0 until structure.windowNodeCount) nodes.add(structure.getWindowNodeAt(i).rootViewNode)

        while (nodes.isNotEmpty()) {
            val node = nodes.removeAt(0)
            val hints = node.autofillHints

            if (!hints.isNullOrEmpty()) {
                when {
                    hints.contains(View.AUTOFILL_HINT_USERNAME) ||
                    hints.contains(View.AUTOFILL_HINT_EMAIL_ADDRESS) ||
                    hints.contains(View.AUTOFILL_HINT_PHONE) ->
                        if (result.usernameId == null) result.usernameId = node.autofillId
                    hints.contains(View.AUTOFILL_HINT_PASSWORD) ->
                        if (result.passwordId == null) result.passwordId = node.autofillId
                }
            } else if (node.className?.contains("EditText") == true && node.autofillId != null) {
                val idEntry = (node.idEntry ?: "").lowercase()
                val inputType = node.inputType
                val isPasswordType = (inputType and android.text.InputType.TYPE_MASK_VARIATION) ==
                        android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                        (inputType and android.text.InputType.TYPE_MASK_VARIATION) ==
                        android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD

                when {
                    isPasswordType && result.passwordId == null ->
                        result.passwordId = node.autofillId
                    (idEntry.contains("user") || idEntry.contains("email") ||
                     idEntry.contains("login") || idEntry.contains("account")) &&
                    result.usernameId == null ->
                        result.usernameId = node.autofillId
                    idEntry.contains("pass") && result.passwordId == null ->
                        result.passwordId = node.autofillId
                }
            }

            for (i in 0 until node.childCount) nodes.add(node.getChildAt(i))
        }
        return result
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }
}
