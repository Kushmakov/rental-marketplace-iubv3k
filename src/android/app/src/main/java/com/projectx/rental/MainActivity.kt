package com.projectx.rental

import android.content.Intent
import android.os.Bundle
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import com.projectx.rental.data.repository.AuthRepository
import com.projectx.rental.ui.auth.AuthActivity
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.ui.dashboard.DashboardActivity
import com.projectx.rental.util.SecurityUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Main entry point activity for the rental application.
 * Handles initial app launch, authentication state verification, and secure navigation.
 * Implements enhanced security measures and comprehensive error handling.
 *
 * @version 1.0.0
 */
@AndroidEntryPoint
class MainActivity : BaseActivity() {

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var securityUtils: SecurityUtils

    @Inject
    lateinit var analytics: Analytics

    @Inject
    lateinit var deepLinkHandler: DeepLinkHandler

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize security checks
        initializeSecurity()

        // Handle deep links if any
        handleDeepLink(intent)

        // Check authentication state
        checkAuthState()

        // Set up observers
        setupObservers()

        // Track app launch
        analytics.trackAppLaunch()
    }

    /**
     * Initializes security components and verifies app integrity
     */
    private fun initializeSecurity() {
        try {
            // Verify app signature
            if (!securityUtils.verifyAppSignature(this)) {
                showError(ErrorType.SECURITY, "App signature verification failed")
                finish()
                return
            }

            // Check for root detection
            if (securityUtils.isDeviceRooted()) {
                showError(ErrorType.SECURITY, "Device security check failed")
                finish()
                return
            }

            // Initialize secure storage
            securityUtils.initializeSecureStorage()
        } catch (e: Exception) {
            Timber.e(e, "Security initialization failed")
            showError(ErrorType.SECURITY, "Security initialization failed")
            finish()
        }
    }

    /**
     * Checks current authentication state and navigates accordingly
     */
    private fun checkAuthState() {
        lifecycleScope.launch {
            try {
                showLoading()
                
                // Check network connectivity
                if (!viewModel.isNetworkAvailable()) {
                    handleOfflineMode()
                    return@launch
                }

                // Verify authentication state
                when (val state = authRepository.authState.value) {
                    is AuthState.Authenticated -> {
                        // Validate token
                        if (viewModel.validateToken(state.user)) {
                            navigateToDashboard()
                        } else {
                            navigateToAuth()
                        }
                    }
                    is AuthState.Unauthenticated -> {
                        navigateToAuth()
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Auth state check failed")
                showError(ErrorType.GENERAL, "Authentication verification failed")
                navigateToAuth()
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Sets up observers for authentication and error states
     */
    private fun setupObservers() {
        viewModel.authState.observe(this) { state ->
            when (state) {
                is AuthState.Authenticated -> navigateToDashboard()
                is AuthState.Unauthenticated -> navigateToAuth()
            }
        }

        viewModel.error.observe(this) { error ->
            showError(ErrorType.GENERAL, error)
        }
    }

    /**
     * Handles offline mode when network is unavailable
     */
    private fun handleOfflineMode() {
        lifecycleScope.launch {
            val hasValidCache = viewModel.checkOfflineAccess()
            if (hasValidCache) {
                navigateToDashboard()
            } else {
                showError(ErrorType.NETWORK, "Network connection required for first login")
                navigateToAuth()
            }
        }
    }

    /**
     * Navigates to dashboard with proper activity flags
     */
    private fun navigateToDashboard() {
        try {
            val intent = Intent(this, DashboardActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            finish()
            
            analytics.trackNavigation("dashboard")
        } catch (e: Exception) {
            Timber.e(e, "Navigation to dashboard failed")
            showError(ErrorType.GENERAL, "Navigation failed")
        }
    }

    /**
     * Navigates to authentication with proper activity flags
     */
    private fun navigateToAuth() {
        try {
            val intent = Intent(this, AuthActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            finish()
            
            analytics.trackNavigation("auth")
        } catch (e: Exception) {
            Timber.e(e, "Navigation to auth failed")
            showError(ErrorType.GENERAL, "Navigation failed")
        }
    }

    /**
     * Handles deep links and app shortcuts
     */
    private fun handleDeepLink(intent: Intent) {
        try {
            val deepLink = deepLinkHandler.extractDeepLink(intent)
            deepLink?.let {
                viewModel.storeDeepLink(it)
            }
        } catch (e: Exception) {
            Timber.e(e, "Deep link handling failed")
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleDeepLink(it) }
    }
}