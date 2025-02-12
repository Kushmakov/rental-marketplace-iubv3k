package com.projectx.rental.util

import android.content.Context
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import com.projectx.rental.util.BIOMETRIC.PROMPT_TITLE
import com.projectx.rental.util.BIOMETRIC.PROMPT_SUBTITLE
import com.projectx.rental.util.BIOMETRIC.PROMPT_DESCRIPTION

/**
 * Helper class for managing biometric authentication operations with enhanced security measures.
 * Implements strong biometric authentication with comprehensive error handling and security validations.
 * Version: 1.0.0
 */
class BiometricHelper {

    companion object {
        private const val TAG = "BiometricHelper"
        private const val BIOMETRIC_STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG
        private const val DEVICE_CREDENTIAL = BiometricManager.Authenticators.DEVICE_CREDENTIAL
        private const val MAX_RETRY_COUNT = 3
        private const val AUTH_TIMEOUT_MS = 30000L
    }

    /**
     * Represents the availability status of biometric authentication
     */
    enum class BiometricAvailability {
        AVAILABLE,
        HARDWARE_UNAVAILABLE,
        NOT_ENROLLED,
        SECURITY_UPDATE_REQUIRED,
        HARDWARE_COMPROMISED,
        UNKNOWN_ERROR
    }

    /**
     * Enhanced callback interface for biometric authentication results
     */
    interface BiometricAuthCallback {
        fun onBiometricAuthSuccess(result: BiometricPrompt.AuthenticationResult)
        fun onBiometricAuthError(errorCode: Int, errString: String)
    }

    /**
     * Checks if biometric authentication is available and meets security requirements
     *
     * @param context Application context
     * @return BiometricAvailability status
     */
    fun checkBiometricAvailability(context: Context): BiometricAvailability {
        val biometricManager = BiometricManager.from(context)
        
        return when (biometricManager.canAuthenticate(BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS ->
                BiometricAvailability.AVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                BiometricAvailability.HARDWARE_UNAVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricAvailability.NOT_ENROLLED
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                BiometricAvailability.SECURITY_UPDATE_REQUIRED
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricAvailability.HARDWARE_UNAVAILABLE
            else -> BiometricAvailability.UNKNOWN_ERROR
        }.also {
            Log.d(TAG, "Biometric availability status: $it")
        }
    }

    /**
     * Shows biometric authentication prompt with enhanced security measures
     *
     * @param activity FragmentActivity for displaying the prompt
     * @param callback BiometricAuthCallback for handling authentication results
     * @param executor Executor for running authentication operations
     */
    fun showBiometricPrompt(
        activity: FragmentActivity,
        callback: BiometricAuthCallback,
        executor: Executor
    ) {
        val authState = AuthenticationState()

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(PROMPT_TITLE)
            .setSubtitle(PROMPT_SUBTITLE)
            .setDescription(PROMPT_DESCRIPTION)
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .setConfirmationRequired(true)
            .build()

        val biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (authState.isWithinTimeout() && !authState.hasExceededRetries()) {
                        handleAuthenticationSuccess(result, callback, authState)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: String) {
                    handleAuthenticationError(errorCode, errString, callback, authState)
                }

                override fun onAuthenticationFailed() {
                    handleAuthenticationFailure(callback, authState)
                }
            })

        try {
            authState.startAuthentication()
            biometricPrompt.authenticate(promptInfo)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing biometric prompt: ${e.message}")
            callback.onBiometricAuthError(
                BiometricPrompt.ERROR_VENDOR,
                "Failed to show biometric prompt"
            )
        }
    }

    private class AuthenticationState {
        private val isAuthenticating = AtomicBoolean(false)
        private var retryCount = 0
        private var startTime: Long = 0

        fun startAuthentication() {
            isAuthenticating.set(true)
            startTime = System.currentTimeMillis()
            retryCount = 0
        }

        fun incrementRetryCount() = ++retryCount

        fun hasExceededRetries() = retryCount >= MAX_RETRY_COUNT

        fun isWithinTimeout() = 
            System.currentTimeMillis() - startTime <= AUTH_TIMEOUT_MS

        fun reset() {
            isAuthenticating.set(false)
            retryCount = 0
            startTime = 0
        }
    }

    private fun handleAuthenticationSuccess(
        result: BiometricPrompt.AuthenticationResult,
        callback: BiometricAuthCallback,
        authState: AuthenticationState
    ) {
        try {
            // Validate cryptographic authentication result
            result.cryptoObject?.let { cryptoObject ->
                // Encrypt sensitive data after successful authentication
                encryptData("auth_token", true)
            }
            
            Log.d(TAG, "Biometric authentication succeeded")
            authState.reset()
            callback.onBiometricAuthSuccess(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing authentication success: ${e.message}")
            callback.onBiometricAuthError(
                BiometricPrompt.ERROR_VENDOR,
                "Failed to process authentication"
            )
        }
    }

    private fun handleAuthenticationError(
        errorCode: Int,
        errString: String,
        callback: BiometricAuthCallback,
        authState: AuthenticationState
    ) {
        Log.e(TAG, "Biometric authentication error [$errorCode]: $errString")
        authState.reset()
        callback.onBiometricAuthError(errorCode, errString)
    }

    private fun handleAuthenticationFailure(
        callback: BiometricAuthCallback,
        authState: AuthenticationState
    ) {
        val retryCount = authState.incrementRetryCount()
        
        if (authState.hasExceededRetries()) {
            Log.w(TAG, "Maximum retry attempts exceeded")
            callback.onBiometricAuthError(
                BiometricPrompt.ERROR_LOCKOUT,
                "Too many failed attempts"
            )
            authState.reset()
        } else if (!authState.isWithinTimeout()) {
            Log.w(TAG, "Authentication timeout")
            callback.onBiometricAuthError(
                BiometricPrompt.ERROR_TIMEOUT,
                "Authentication timeout"
            )
            authState.reset()
        } else {
            Log.d(TAG, "Authentication failed, attempt $retryCount of $MAX_RETRY_COUNT")
        }
    }
}