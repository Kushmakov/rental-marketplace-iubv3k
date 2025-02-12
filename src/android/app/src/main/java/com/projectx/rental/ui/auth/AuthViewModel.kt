package com.projectx.rental.ui.auth

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.SecureTokenManager
import androidx.work.NetworkStateManager
import com.projectx.rental.data.db.entities.User
import com.projectx.rental.data.repository.AuthRepository
import com.projectx.rental.data.repository.AuthState
import com.projectx.rental.ui.common.BaseViewModel
import com.projectx.rental.util.AUTH
import com.projectx.rental.util.VALIDATION
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * ViewModel responsible for managing authentication state and operations.
 * Implements secure OAuth 2.0 + JWT authentication with biometric support.
 *
 * @property authRepository Repository handling authentication operations
 * @property networkStateManager Monitors network connectivity
 * @property secureTokenManager Handles secure token storage
 * @version 1.0.0
 */
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val networkStateManager: NetworkStateManager,
    private val secureTokenManager: SecureTokenManager
) : BaseViewModel() {

    // Authentication state
    private val _currentUser = MutableLiveData<User?>()
    val currentUser: LiveData<User?> = _currentUser

    private val _isAuthenticated = MutableLiveData<Boolean>()
    val isAuthenticated: LiveData<Boolean> = _isAuthenticated

    private val _biometricAvailable = MutableLiveData<Boolean>()
    val biometricAvailable: LiveData<Boolean> = _biometricAvailable

    private val _authError = MutableLiveData<AuthError>()
    val authError: LiveData<AuthError> = _authError

    // Token refresh job
    private var tokenRefreshJob: Job? = null

    init {
        initializeAuthState()
        setupTokenRefresh()
    }

    /**
     * Authenticates user with email and password.
     * Implements secure credential handling and token management.
     *
     * @param email User's email address
     * @param password User's password
     * @param enableBiometric Enable biometric authentication for future logins
     */
    fun login(email: String, password: String, enableBiometric: Boolean = false) {
        if (!validateCredentials(email, password)) {
            return
        }

        viewModelScope.launch {
            try {
                showLoading()

                if (!networkStateManager.isNetworkAvailable()) {
                    handleAuthError(AuthError.NetworkError)
                    return@launch
                }

                authRepository.login(email, password, enableBiometric)
                    .collect { result ->
                        result.onSuccess { authState ->
                            when (authState) {
                                is AuthState.Authenticated -> {
                                    _currentUser.value = authState.user
                                    _isAuthenticated.value = true
                                    _biometricAvailable.value = authState.isBiometricEnabled
                                    setupTokenRefresh()
                                }
                                else -> handleAuthError(AuthError.AuthenticationFailed)
                            }
                        }.onFailure { throwable ->
                            handleAuthError(mapErrorToAuthError(throwable))
                        }
                    }
            } catch (e: Exception) {
                Timber.e(e, "Login failed")
                handleAuthError(mapErrorToAuthError(e))
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Logs out current user and clears authentication state.
     * Implements secure token and credential cleanup.
     */
    fun logout() {
        viewModelScope.launch {
            try {
                showLoading()
                tokenRefreshJob?.cancel()
                
                authRepository.clearAuthState()
                secureTokenManager.clearTokens()
                
                _currentUser.value = null
                _isAuthenticated.value = false
                _biometricAvailable.value = false
            } catch (e: Exception) {
                Timber.e(e, "Logout failed")
                handleAuthError(AuthError.LogoutError)
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Refreshes authentication token before expiry.
     * Implements secure token rotation and error handling.
     */
    private fun refreshToken() {
        viewModelScope.launch {
            try {
                authRepository.refreshToken()
                    .collect { result ->
                        result.onSuccess { token ->
                            secureTokenManager.storeToken(
                                AUTH.ACCESS_TOKEN_KEY,
                                token,
                                TimeUnit.HOURS.toMillis(1)
                            )
                        }.onFailure { throwable ->
                            Timber.e(throwable, "Token refresh failed")
                            handleAuthError(AuthError.TokenRefreshFailed)
                            logout()
                        }
                    }
            } catch (e: Exception) {
                Timber.e(e, "Token refresh failed")
                handleAuthError(AuthError.TokenRefreshFailed)
                logout()
            }
        }
    }

    /**
     * Initializes authentication state from secure storage.
     */
    private fun initializeAuthState() {
        viewModelScope.launch {
            try {
                val user = authRepository.getCurrentUser()
                _currentUser.value = user
                _isAuthenticated.value = user != null
                _biometricAvailable.value = secureTokenManager.isBiometricEnabled()
            } catch (e: Exception) {
                Timber.e(e, "Failed to initialize auth state")
                handleAuthError(AuthError.InitializationError)
            }
        }
    }

    /**
     * Sets up automatic token refresh before expiry.
     */
    private fun setupTokenRefresh() {
        tokenRefreshJob?.cancel()
        tokenRefreshJob = viewModelScope.launch {
            while (true) {
                delay(TimeUnit.MINUTES.toMillis(45)) // Refresh 15 minutes before expiry
                if (_isAuthenticated.value == true) {
                    refreshToken()
                }
            }
        }
    }

    /**
     * Validates user credentials against security requirements.
     */
    private fun validateCredentials(email: String, password: String): Boolean {
        if (!email.matches(Regex(VALIDATION.EMAIL_PATTERN))) {
            handleAuthError(AuthError.InvalidEmail)
            return false
        }

        if (!password.matches(Regex(VALIDATION.PASSWORD_PATTERN))) {
            handleAuthError(AuthError.InvalidPassword)
            return false
        }

        return true
    }

    /**
     * Handles authentication errors with appropriate user feedback.
     */
    private fun handleAuthError(error: AuthError) {
        _authError.value = error
        showError(error.message)
    }

    /**
     * Maps exceptions to specific authentication errors.
     */
    private fun mapErrorToAuthError(throwable: Throwable): AuthError {
        return when (throwable) {
            is SecurityException -> AuthError.SecurityError
            is IllegalArgumentException -> AuthError.InvalidCredentials
            else -> AuthError.UnknownError
        }
    }

    override fun onCleared() {
        tokenRefreshJob?.cancel()
        super.onCleared()
    }
}

/**
 * Represents various authentication error states.
 */
sealed class AuthError(val message: String) {
    object NetworkError : AuthError("No network connection available")
    object InvalidEmail : AuthError("Invalid email format")
    object InvalidPassword : AuthError("Password does not meet security requirements")
    object InvalidCredentials : AuthError("Invalid email or password")
    object AuthenticationFailed : AuthError("Authentication failed")
    object TokenRefreshFailed : AuthError("Failed to refresh authentication token")
    object SecurityError : AuthError("Security verification failed")
    object LogoutError : AuthError("Failed to complete logout")
    object InitializationError : AuthError("Failed to initialize authentication")
    object UnknownError : AuthError("An unknown error occurred")
}