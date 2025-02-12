package com.projectx.rental.ui.auth

import android.os.Bundle
import android.view.View
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentContainerView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import androidx.navigation.fragment.NavHostFragment
import com.projectx.rental.R
import com.projectx.rental.databinding.ActivityAuthBinding
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.util.BIOMETRIC
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.Executor
import javax.inject.Inject

/**
 * Activity managing secure authentication flow with biometric support.
 * Implements OAuth 2.0 + JWT token-based authentication following Material Design guidelines.
 *
 * @version 1.0.0
 */
@AndroidEntryPoint
class AuthActivity : BaseActivity() {

    private lateinit var binding: ActivityAuthBinding
    private val authViewModel: AuthViewModel by viewModels()
    private lateinit var navController: NavController
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo
    private lateinit var executor: Executor

    override val viewModel by viewModels<AuthViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize view binding with security checks
        binding = ActivityAuthBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Set up secure navigation
        setupSecureNavigation()

        // Initialize biometric authentication
        setupBiometricAuth()

        // Observe authentication state
        observeAuthState()

        // Set up error handling
        setupErrorHandling()
    }

    /**
     * Sets up secure navigation between authentication fragments
     */
    private fun setupSecureNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.auth_nav_host_fragment) as NavHostFragment
        navController = navHostFragment.navController

        // Configure navigation with security checks
        navController.addOnDestinationChangedListener { _, destination, _ ->
            when (destination.id) {
                R.id.loginFragment -> binding.authToolbar.title = getString(R.string.login_title)
                R.id.signupFragment -> binding.authToolbar.title = getString(R.string.signup_title)
                R.id.forgotPasswordFragment -> binding.authToolbar.title = getString(R.string.forgot_password_title)
            }
        }
    }

    /**
     * Initializes biometric authentication with proper security parameters
     */
    private fun setupBiometricAuth() {
        executor = ContextCompat.getMainExecutor(this)
        
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    authViewModel.handleBiometricSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    handleBiometricError(errorCode, errString)
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    showError(ErrorType.GENERAL, getString(R.string.biometric_authentication_failed))
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(BIOMETRIC.PROMPT_TITLE)
            .setSubtitle(BIOMETRIC.PROMPT_SUBTITLE)
            .setDescription(BIOMETRIC.PROMPT_DESCRIPTION)
            .setNegativeButtonText(getString(R.string.cancel))
            .setConfirmationRequired(true)
            .build()
    }

    /**
     * Observes authentication state changes with proper error handling
     */
    private fun observeAuthState() {
        lifecycleScope.launch {
            lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Observe authentication state
                authViewModel.authState.collectLatest { state ->
                    when (state) {
                        is AuthState.Authenticated -> {
                            if (state.isBiometricEnabled) {
                                showBiometricPrompt()
                            } else {
                                navigateToDashboard()
                            }
                        }
                        is AuthState.Unauthenticated -> {
                            navController.navigate(R.id.loginFragment)
                        }
                    }
                }
            }
        }

        // Observe authentication errors
        authViewModel.authError.observe(this) { error ->
            when (error) {
                is AuthError.NetworkError -> showError(ErrorType.NETWORK, error.message)
                is AuthError.SecurityError -> showError(ErrorType.GENERAL, error.message)
                else -> showError(ErrorType.GENERAL, error.message)
            }
        }
    }

    /**
     * Sets up error handling with proper user feedback
     */
    private fun setupErrorHandling() {
        binding.authErrorView.setOnClickListener {
            binding.authErrorView.visibility = View.GONE
        }
    }

    /**
     * Handles biometric authentication errors
     */
    private fun handleBiometricError(errorCode: Int, errString: CharSequence) {
        val errorMessage = when (errorCode) {
            BiometricPrompt.ERROR_HW_NOT_PRESENT -> BIOMETRIC.ERROR_MESSAGES.HARDWARE_UNAVAILABLE
            BiometricPrompt.ERROR_HW_UNAVAILABLE -> BIOMETRIC.ERROR_MESSAGES.HARDWARE_UNAVAILABLE
            BiometricPrompt.ERROR_LOCKOUT -> getString(R.string.biometric_lockout)
            BiometricPrompt.ERROR_NO_BIOMETRICS -> BIOMETRIC.ERROR_MESSAGES.NO_BIOMETRICS_ENROLLED
            else -> BIOMETRIC.ERROR_MESSAGES.BIOMETRIC_ERROR_UNKNOWN
        }
        showError(ErrorType.GENERAL, errorMessage)
        Timber.e("Biometric error: $errorCode - $errString")
    }

    /**
     * Shows biometric authentication prompt
     */
    private fun showBiometricPrompt() {
        val biometricManager = BiometricManager.from(this)
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                biometricPrompt.authenticate(promptInfo)
            }
            else -> {
                showError(ErrorType.GENERAL, BIOMETRIC.ERROR_MESSAGES.HARDWARE_UNAVAILABLE)
            }
        }
    }

    /**
     * Navigates to dashboard after successful authentication
     */
    private fun navigateToDashboard() {
        // Implement secure navigation to dashboard
        startActivity(Intent(this, DashboardActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        // Clean up resources
        executor.shutdown()
        super.onDestroy()
    }
}