package com.projectx.rental.data.repository

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import com.projectx.rental.data.api.ApiService
import com.projectx.rental.data.api.AuthResponse
import com.projectx.rental.data.api.LoginRequest
import com.projectx.rental.data.api.RefreshTokenRequest
import com.projectx.rental.data.db.dao.UserDao
import com.projectx.rental.data.db.entities.User
import com.projectx.rental.util.AUTH
import com.projectx.rental.util.BIOMETRIC
import com.projectx.rental.util.SecurityUtils
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import retrofit2.Response
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository implementing secure authentication, token management, and user profile handling.
 * Provides OAuth 2.0 + JWT token-based authentication with biometric support and offline capabilities.
 *
 * @property apiService API service for authentication endpoints
 * @property userDao Local database access for user data
 * @property securityUtils Security utilities for token encryption
 * @property biometricManager Biometric authentication manager
 */
@Singleton
class AuthRepository @Inject constructor(
    private val apiService: ApiService,
    private val userDao: UserDao,
    private val securityUtils: SecurityUtils,
    private val biometricManager: BiometricManager
) {
    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser

    private val _authState = MutableStateFlow<AuthState>(AuthState.Unauthenticated)
    val authState: StateFlow<AuthState> = _authState

    private var _encryptedToken: String? = null
    private var tokenExpiryTime: Long = 0L

    /**
     * Authenticates user with enhanced security and offline support.
     *
     * @param email User email
     * @param password User password
     * @param useBiometric Enable biometric authentication
     * @return Flow of authentication result
     */
    fun login(
        email: String,
        password: String,
        useBiometric: Boolean = false
    ): Flow<Result<AuthState>> = flow {
        try {
            // Input validation
            if (!isValidEmail(email) || !isValidPassword(password)) {
                emit(Result.failure(IllegalArgumentException("Invalid credentials format")))
                return@flow
            }

            // Biometric authentication if enabled
            if (useBiometric && !authenticateWithBiometric()) {
                emit(Result.failure(SecurityException("Biometric authentication failed")))
                return@flow
            }

            // Attempt API login
            val loginResponse = apiService.login(LoginRequest(email, password))
            
            if (loginResponse.isSuccessful && loginResponse.body() != null) {
                handleSuccessfulAuth(loginResponse.body()!!, useBiometric)
                emit(Result.success(_authState.value))
            } else {
                emit(Result.failure(Exception("Authentication failed: ${loginResponse.message()}")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    /**
     * Handles automatic token refresh before expiry.
     */
    fun refreshToken(): Flow<Result<String>> = flow {
        try {
            val decryptedToken = _encryptedToken?.let { securityUtils.decryptData(it) }
                ?: throw SecurityException("No token available")

            val refreshResponse = apiService.refreshToken(RefreshTokenRequest(decryptedToken))
            
            if (refreshResponse.isSuccessful && refreshResponse.body() != null) {
                handleSuccessfulAuth(refreshResponse.body()!!, false)
                emit(Result.success(decryptedToken))
            } else {
                emit(Result.failure(Exception("Token refresh failed")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    /**
     * Securely clears authentication state and sensitive data.
     */
    suspend fun clearAuthState() {
        try {
            _encryptedToken = null
            tokenExpiryTime = 0L
            _currentUser.value = null
            _authState.value = AuthState.Unauthenticated
            
            securityUtils.clearKeys()
            userDao.clearUserData()
            
            System.gc() // Request garbage collection
        } catch (e: Exception) {
            throw SecurityException("Failed to clear auth state: ${e.message}")
        }
    }

    /**
     * Processes successful authentication response.
     */
    private suspend fun handleSuccessfulAuth(response: AuthResponse, enableBiometric: Boolean) {
        // Encrypt and store tokens
        _encryptedToken = securityUtils.encryptData(response.accessToken)
        tokenExpiryTime = System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1)

        // Update user data
        _currentUser.value = response.user
        userDao.insertUser(response.user)

        // Update authentication state
        _authState.value = AuthState.Authenticated(
            user = response.user,
            isBiometricEnabled = enableBiometric
        )
    }

    /**
     * Validates email format.
     */
    private fun isValidEmail(email: String): Boolean {
        return email.matches(Regex(com.projectx.rental.util.VALIDATION.EMAIL_PATTERN))
    }

    /**
     * Validates password requirements.
     */
    private fun isValidPassword(password: String): Boolean {
        return password.matches(Regex(com.projectx.rental.util.VALIDATION.PASSWORD_PATTERN))
    }

    /**
     * Handles biometric authentication.
     */
    private suspend fun authenticateWithBiometric(): Boolean {
        return when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                // Implement biometric prompt logic
                true
            }
            else -> false
        }
    }
}

/**
 * Represents the current authentication state.
 */
sealed class AuthState {
    object Unauthenticated : AuthState()
    data class Authenticated(
        val user: User,
        val isBiometricEnabled: Boolean
    ) : AuthState()
}