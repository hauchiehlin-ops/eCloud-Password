package com.drbarret.privatevault

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.Base64
import android.util.Log
import android.view.*
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * VaultPickerActivity
 *
 * 透過 Authentication Intent 從 VaultAutofillService 啟動。
 * 提供帶搜尋功能的密碼選取介面，選取後透過 AutofillManager 回填至原始欄位。
 */
class VaultPickerActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "VaultPickerActivity"
        private const val PREFS_NAME = "VaultAutofillPrefs"
        private const val KEY_NAME = "VaultAutofillKey"
        private const val DATA_KEY = "encrypted_credentials"
        private const val IV_KEY = "crypto_iv"
    }

    private var allCredentials: List<Map<String, String>> = emptyList()
    private var filteredCredentials: MutableList<Map<String, String>> = mutableListOf()
    private lateinit var adapter: CredentialAdapter
    private var autofillIds: List<AutofillId> = emptyList()
    private var isUsernamePresent = true
    private var isPasswordPresent = true

    // MARK: - Lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 接收 autofill field IDs
        @Suppress("DEPRECATION")
        autofillIds = intent.getParcelableArrayListExtra<AutofillId>("autofill_ids") ?: emptyList()
        isUsernamePresent = intent.getBooleanExtra("is_username_first", true)
        isPasswordPresent = intent.getBooleanExtra("is_password_present", true)

        setupContentView()
        loadCredentials()
    }

    // MARK: - UI Setup（Pure Code，不依賴 layout XML）

    private fun setupContentView() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(android.graphics.Color.parseColor("#1A1A1A"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Header
        val header = TextView(this).apply {
            text = "Cloud Password"
            textSize = 20f
            setTextColor(android.graphics.Color.parseColor("#FFC107"))
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(48, 48, 48, 16)
        }
        root.addView(header)

        // Search Bar
        val searchBar = EditText(this).apply {
            hint = "搜尋服務名稱、帳號..."
            setHintTextColor(android.graphics.Color.parseColor("#888888"))
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#2D2D2D"))
            setPadding(32, 24, 32, 24)
            textSize = 16f
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) { filterCredentials(s?.toString() ?: "") }
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            })
        }
        val searchParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { setMargins(32, 8, 32, 8) }
        root.addView(searchBar, searchParams)

        // List
        val listView = ListView(this).apply {
            adapter = CredentialAdapter().also { this@VaultPickerActivity.adapter = it }
            dividerHeight = 1
            setDivider(android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#444444")))
            setOnItemClickListener { _, _, position, _ ->
                onCredentialSelected(filteredCredentials[position])
            }
        }
        root.addView(listView, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))

        // Cancel button
        val cancelBtn = Button(this).apply {
            text = "取消"
            setTextColor(android.graphics.Color.parseColor("#888888"))
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            setOnClickListener { cancelAutofill() }
        }
        root.addView(cancelBtn, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        setContentView(root)
    }

    // MARK: - Data

    private fun loadCredentials() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val encryptedData = prefs.getString(DATA_KEY, null)
        val ivBase64 = prefs.getString(IV_KEY, null)

        if (encryptedData == null || ivBase64 == null) {
            Toast.makeText(this, "保險庫未同步，請先開啟主程式。", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        try {
            val jsonString = decryptData(encryptedData, ivBase64)
            allCredentials = parseJson(jsonString)
            filteredCredentials = allCredentials.toMutableList()
            adapter.notifyDataSetChanged()
        } catch (e: Exception) {
            Log.e(TAG, "Load credentials failed", e)
            Toast.makeText(this, "解密失敗，請重新開啟主程式。", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun filterCredentials(query: String) {
        val q = query.trim().lowercase()
        filteredCredentials = if (q.isEmpty()) {
            allCredentials.toMutableList()
        } else {
            allCredentials.filter { cred ->
                val service  = (cred["serviceName"] ?: "").lowercase()
                val username = (cred["username"] ?: "").lowercase()
                val url      = (cred["url"] ?: "").lowercase()
                service.contains(q) || username.contains(q) || url.contains(q)
            }.toMutableList()
        }
        adapter.notifyDataSetChanged()
    }

    // MARK: - Credential Selection

    private fun onCredentialSelected(cred: Map<String, String>) {
        val type     = cred["type"] ?: "PASSWORD"
        val username = if (type == "CARD") cred["cardholderName"] ?: "" else cred["username"] ?: ""
        val password = if (type == "CARD") cred["cardNumber"] ?: "" else cred["password"] ?: ""

        if (autofillIds.isEmpty()) {
            Log.w(TAG, "No autofill IDs received")
            finish()
            return
        }

        // 建立填充結果回傳給 AutofillManager
        val replyIntent = Intent().apply {
            val fillResponse = android.service.autofill.FillResponse.Builder()
            val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
            presentation.setTextViewText(android.R.id.text1, "${cred["serviceName"]} ($username)")

            val datasetBuilder = android.service.autofill.Dataset.Builder()
            val ids = autofillIds
            if (isUsernamePresent && ids.isNotEmpty()) {
                datasetBuilder.setValue(ids[0], AutofillValue.forText(username), presentation)
            }
            if (isPasswordPresent && ids.size > 1) {
                datasetBuilder.setValue(ids[1], AutofillValue.forText(password), presentation)
            } else if (isPasswordPresent && ids.size == 1 && !isUsernamePresent) {
                datasetBuilder.setValue(ids[0], AutofillValue.forText(password), presentation)
            }

            fillResponse.addDataset(datasetBuilder.build())
            putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, fillResponse.build())
        }
        setResult(Activity.RESULT_OK, replyIntent)
        finish()
    }

    private fun cancelAutofill() {
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    // MARK: - Adapter

    private inner class CredentialAdapter : BaseAdapter() {
        override fun getCount() = filteredCredentials.size
        override fun getItem(position: Int) = filteredCredentials[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val cred = filteredCredentials[position]
            val type = cred["type"] ?: "PASSWORD"

            val container = LinearLayout(this@VaultPickerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(48, 28, 48, 28)
                setBackgroundColor(android.graphics.Color.parseColor("#2D2D2D"))
            }

            val title = TextView(this@VaultPickerActivity).apply {
                text = if (type == "CARD") {
                    val brand = cred["brand"] ?: "Card"
                    val num   = cred["cardNumber"] ?: ""
                    val last4 = if (num.length >= 4) num.takeLast(4) else num
                    "💳 $brand (****$last4)"
                } else {
                    "🔑 ${cred["serviceName"] ?: "Unknown"}"
                }
                textSize = 15f
                setTextColor(android.graphics.Color.WHITE)
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }

            val subtitle = TextView(this@VaultPickerActivity).apply {
                text = if (type == "CARD") cred["cardholderName"] ?: ""
                       else cred["username"] ?: ""
                textSize = 13f
                setTextColor(android.graphics.Color.parseColor("#888888"))
            }

            container.addView(title)
            container.addView(subtitle)
            return container
        }
    }

    // MARK: - Crypto

    private fun decryptData(encryptedBase64: String, ivBase64: String): String {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        val secretKey = keyStore.getKey(KEY_NAME, null) as SecretKey
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, Base64.decode(ivBase64, Base64.DEFAULT)))
        return String(cipher.doFinal(Base64.decode(encryptedBase64, Base64.DEFAULT)), Charsets.UTF_8)
    }

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
}
