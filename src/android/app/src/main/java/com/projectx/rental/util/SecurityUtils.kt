package com.projectx.rental.util

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.projectx.rental.util.BIOMETRIC.PROMPT_TITLE
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.concurrent.TimeUnit

/**
 * Utility class providing cryptographic operations for sensitive data protection.
 * Implements AES-256 encryption with GCM mode, secure key storage, and memory protection.
 * Compliant with SOC 2 Type II and GDPR requirements.
 * 
 * @version 1.0.0
 * @see KeyStore
 * @see Cipher
 */
object SecurityUtils {

    // Cryptographic constants
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val KEY_ALIAS = "ProjectXKey"
    private const val KEY_STORE = "AndroidKeyStore"
    private const val KEY_SIZE = 256
    private const val GCM_TAG_LENGTH = 128
    private const val KEY_ROTATION_INTERVAL = 90L * 24 * 60 * 60 * 1000 // 90 days in milliseconds

    // Secure random number generator
    private val secureRandom = SecureRandom()

    /**
     * Generates or retrieves a secret key for encryption/decryption operations.
     * Implements automatic key rotation based on defined interval.
     *
     * @param forceRotation Force generation of a new key regardless of rotation schedule
     * @return SecretKey for cryptographic operations
     * @throws SecurityException if key generation fails
     */
    @Synchronized
    private fun generateSecretKey(forceRotation: Boolean = false): SecretKey {
        try {
            val keyStore = KeyStore.getInstance(KEY_STORE).apply { load(null) }
            
            // Check existing key and rotation policy
            val existingKey = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            val shouldRotate = existingKey?.let {
                val creationDate = keyStore.getCreationDate(KEY_ALIAS)
                System.currentTimeMillis() - creationDate.time > KEY_ROTATION_INTERVAL
            } ?: true

            if (shouldRotate || forceRotation) {
                // Generate new key with enhanced security parameters
                val keyGenerator = javax.crypto.KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    KEY_STORE
                )

                val keySpec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                ).apply {
                    setKeySize(KEY_SIZE)
                    setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    setRandomizedEncryptionRequired(true)
                    setUserAuthenticationRequired(false) // Configured based on security requirements
                    setKeyValidityDuration(TimeUnit.DAYS.toMillis(90))
                }.build()

                keyGenerator.init(keySpec)
                return keyGenerator.generateKey()
            }

            return (existingKey?.secretKey) ?: throw SecurityException("Failed to retrieve existing key")
        } catch (e: Exception) {
            throw SecurityException("Key generation failed: ${e.message}", e)
        }
    }

    /**
     * Encrypts sensitive data using AES-256 encryption with GCM mode.
     *
     * @param data String to encrypt
     * @param requireFreshKey Force the use of a newly generated key
     * @return Base64 encoded encrypted data with IV
     * @throws IllegalArgumentException if input data is invalid
     * @throws SecurityException if encryption fails
     */
    @Throws(SecurityException::class)
    fun encryptData(data: String, requireFreshKey: Boolean = false): String {
        if (data.isEmpty()) {
            throw IllegalArgumentException("Input data cannot be empty")
        }

        try {
            val key = generateSecretKey(requireFreshKey)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            
            // Generate random IV
            val iv = ByteArray(12).apply { secureRandom.nextBytes(this) }
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            
            cipher.init(Cipher.ENCRYPT_MODE, key, gcmSpec)
            
            val encryptedData = cipher.doFinal(data.toByteArray(Charsets.UTF_8))
            
            // Combine IV and encrypted data
            val combined = ByteArray(iv.size + encryptedData.size).apply {
                System.arraycopy(iv, 0, this, 0, iv.size)
                System.arraycopy(encryptedData, 0, this, iv.size, encryptedData.size)
            }
            
            return Base64.encodeToString(combined, Base64.NO_WRAP)
        } catch (e: Exception) {
            throw SecurityException("Encryption failed: ${e.message}", e)
        } finally {
            // Clear sensitive data from memory
            wipeMemory(data.toByteArray())
        }
    }

    /**
     * Decrypts encrypted data with integrity verification.
     *
     * @param encryptedData Base64 encoded encrypted data with IV
     * @return Original decrypted string
     * @throws IllegalArgumentException if input data is invalid
     * @throws SecurityException if decryption or verification fails
     */
    @Throws(SecurityException::class)
    fun decryptData(encryptedData: String): String {
        if (encryptedData.isEmpty()) {
            throw IllegalArgumentException("Encrypted data cannot be empty")
        }

        try {
            val combined = Base64.decode(encryptedData, Base64.NO_WRAP)
            if (combined.size < 12) {
                throw SecurityException("Invalid encrypted data format")
            }

            // Extract IV and encrypted data
            val iv = ByteArray(12)
            val encrypted = ByteArray(combined.size - 12)
            System.arraycopy(combined, 0, iv, 0, 12)
            System.arraycopy(combined, 12, encrypted, 0, encrypted.size)

            val key = generateSecretKey(false)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            
            cipher.init(Cipher.DECRYPT_MODE, key, gcmSpec)
            
            return cipher.doFinal(encrypted).toString(Charsets.UTF_8)
        } catch (e: Exception) {
            throw SecurityException("Decryption failed: ${e.message}", e)
        }
    }

    /**
     * Securely removes all cryptographic keys from KeyStore.
     *
     * @throws SecurityException if key deletion fails
     */
    @Throws(SecurityException::class)
    fun clearKeys() {
        try {
            val keyStore = KeyStore.getInstance(KEY_STORE).apply { load(null) }
            keyStore.deleteEntry(KEY_ALIAS)
        } catch (e: Exception) {
            throw SecurityException("Failed to clear keys: ${e.message}", e)
        }
    }

    /**
     * Securely wipes sensitive data from memory.
     * Implements multiple overwrite passes to ensure data cannot be recovered.
     *
     * @param data ByteArray to be securely wiped
     */
    private fun wipeMemory(data: ByteArray) {
        // Multiple overwrite passes
        for (i in data.indices) {
            data[i] = 0 // Zero pass
        }
        for (i in data.indices) {
            data[i] = 0xFF.toByte() // One pass
        }
        secureRandom.nextBytes(data) // Random pass
        
        System.gc() // Request garbage collection
    }

    /**
     * Verifies the integrity of the cryptographic system.
     *
     * @return Boolean indicating if the crypto system is properly initialized
     */
    private fun verifyCryptoSystem(): Boolean {
        return try {
            val testData = "verification_test"
            val encrypted = encryptData(testData, true)
            val decrypted = decryptData(encrypted)
            testData == decrypted
        } catch (e: Exception) {
            false
        }
    }
}