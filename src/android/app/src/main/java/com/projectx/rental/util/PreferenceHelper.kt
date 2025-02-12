package com.projectx.rental.util

import android.content.Context
import android.content.SharedPreferences
import android.util.LruCache
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Enhanced helper class for managing application preferences with support for versioning,
 * encryption, and biometric authentication.
 *
 * Features:
 * - Secure storage using EncryptedSharedPreferences
 * - Memory caching with LruCache
 * - Biometric authentication integration
 * - Preference versioning and migration
 * - Batch operations support
 * - Type-safe preference access
 *
 * @property context Application context
 * @version 1.0.0
 */
class PreferenceHelper(private val context: Context) {

    companion object {
        private const val PREFERENCE_VERSION = 1
        private const val PREFERENCE_VERSION_KEY = "preference_version"
        private const val CACHE_SIZE = 100
        private const val BIOMETRIC_TIMEOUT_MS = 30000L
    }

    private val preferences: SharedPreferences
    private val securePreferences: SharedPreferences
    private val gson: Gson = Gson()
    private val preferenceCache: LruCache<String, Any>
    private val executor: Executor
    private val isInitialized = AtomicBoolean(false)

    init {
        // Initialize regular preferences
        preferences = context.getSharedPreferences(PREFERENCES.FILE_NAME, Context.MODE_PRIVATE)
        
        // Initialize secure preferences with encryption
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        securePreferences = EncryptedSharedPreferences.create(
            context,
            "${PREFERENCES.FILE_NAME}_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // Initialize cache
        preferenceCache = LruCache(CACHE_SIZE)
        
        // Initialize executor for biometric operations
        executor = ContextCompat.getMainExecutor(context)

        // Check for preference version and migrate if needed
        checkAndMigratePreferences()
        
        isInitialized.set(true)
    }

    /**
     * Saves an authentication token securely with optional biometric validation.
     *
     * @param token The authentication token to save
     * @param requireBiometric Whether biometric authentication is required
     * @throws SecurityException If biometric authentication fails
     */
    suspend fun saveAuthToken(token: String, requireBiometric: Boolean = false) {
        if (requireBiometric) {
            val authenticated = authenticateWithBiometric()
            if (!authenticated) {
                throw SecurityException("Biometric authentication required but failed")
            }
        }

        withContext(Dispatchers.IO) {
            securePreferences.edit().apply {
                putString(AUTH.ACCESS_TOKEN_KEY, token)
                apply()
            }
            preferenceCache.put(AUTH.ACCESS_TOKEN_KEY, token)
        }
    }

    /**
     * Retrieves the stored authentication token.
     *
     * @param requireBiometric Whether biometric authentication is required
     * @return The stored token or null if not found
     */
    suspend fun getAuthToken(requireBiometric: Boolean = false): String? {
        if (requireBiometric && !authenticateWithBiometric()) {
            return null
        }

        return withContext(Dispatchers.IO) {
            preferenceCache.get(AUTH.ACCESS_TOKEN_KEY) as String?
                ?: securePreferences.getString(AUTH.ACCESS_TOKEN_KEY, null)?.also {
                    preferenceCache.put(AUTH.ACCESS_TOKEN_KEY, it)
                }
        }
    }

    /**
     * Saves multiple preferences in a single transaction.
     *
     * @param preferences Map of preference key-value pairs
     * @param secure Whether to use encrypted storage
     */
    suspend fun savePreferencesBatch(preferences: Map<String, Any>, secure: Boolean = false) {
        withContext(Dispatchers.IO) {
            val editor = if (secure) securePreferences.edit() else this@PreferenceHelper.preferences.edit()
            
            preferences.forEach { (key, value) ->
                when (value) {
                    is String -> editor.putString(key, value)
                    is Int -> editor.putInt(key, value)
                    is Long -> editor.putLong(key, value)
                    is Float -> editor.putFloat(key, value)
                    is Boolean -> editor.putBoolean(key, value)
                    else -> editor.putString(key, gson.toJson(value))
                }
                preferenceCache.put(key, value)
            }
            
            editor.apply()
        }
    }

    /**
     * Retrieves a preference value with type safety.
     *
     * @param key Preference key
     * @param defaultValue Default value if preference is not found
     * @param secure Whether to use encrypted storage
     * @return The preference value
     */
    @Suppress("UNCHECKED_CAST")
    fun <T> getPreference(key: String, defaultValue: T, secure: Boolean = false): T {
        preferenceCache.get(key)?.let { return it as T }

        val prefs = if (secure) securePreferences else preferences
        val result = when (defaultValue) {
            is String -> prefs.getString(key, defaultValue)
            is Int -> prefs.getInt(key, defaultValue)
            is Long -> prefs.getLong(key, defaultValue)
            is Float -> prefs.getFloat(key, defaultValue)
            is Boolean -> prefs.getBoolean(key, defaultValue)
            else -> {
                val json = prefs.getString(key, null)
                if (json != null) {
                    val type = TypeToken.get(defaultValue!!::class.java).type
                    gson.fromJson<T>(json, type)
                } else defaultValue
            }
        } as T

        preferenceCache.put(key, result)
        return result
    }

    /**
     * Handles preference schema version migrations.
     *
     * @param oldVersion Previous preference version
     * @param newVersion New preference version
     * @return Success status of migration
     */
    private fun migratePreferences(oldVersion: Int, newVersion: Int): Boolean {
        var currentVersion = oldVersion
        
        while (currentVersion < newVersion) {
            when (currentVersion) {
                0 -> migrateFromV0ToV1()
                // Add more migration cases as needed
            }
            currentVersion++
        }

        preferences.edit().putInt(PREFERENCE_VERSION_KEY, newVersion).apply()
        preferenceCache.evictAll()
        return true
    }

    private fun migrateFromV0ToV1() {
        // Implement specific migration logic
    }

    private fun checkAndMigratePreferences() {
        val currentVersion = preferences.getInt(PREFERENCE_VERSION_KEY, 0)
        if (currentVersion < PREFERENCE_VERSION) {
            migratePreferences(currentVersion, PREFERENCE_VERSION)
        }
    }

    private suspend fun authenticateWithBiometric(): Boolean {
        return withContext(Dispatchers.Main) {
            var authenticated = false
            val prompt = BiometricPrompt(
                context as androidx.fragment.app.FragmentActivity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        authenticated = true
                    }
                }
            )

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle(BIOMETRIC.PROMPT_TITLE)
                .setSubtitle(BIOMETRIC.PROMPT_SUBTITLE)
                .setDescription(BIOMETRIC.PROMPT_DESCRIPTION)
                .setNegativeButtonText("Cancel")
                .build()

            prompt.authenticate(promptInfo)
            
            // Wait for authentication result
            kotlinx.coroutines.delay(BIOMETRIC_TIMEOUT_MS)
            authenticated
        }
    }

    /**
     * Clears all preferences and cache.
     *
     * @param secure Whether to clear secure preferences as well
     */
    suspend fun clearAll(secure: Boolean = false) {
        withContext(Dispatchers.IO) {
            preferences.edit().clear().apply()
            if (secure) {
                securePreferences.edit().clear().apply()
            }
            preferenceCache.evictAll()
        }
    }
}