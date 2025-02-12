package com.projectx.rental.ui.auth

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputLayout
import com.projectx.rental.R
import com.projectx.rental.databinding.FragmentLoginBinding
import com.projectx.rental.ui.common.BaseFragment
import com.projectx.rental.util.BIOMETRIC
import com.projectx.rental.util.VALIDATION
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import java.util.concurrent.Executor

/**
 * Fragment handling secure user login with email/password and biometric authentication.
 * Implements Material Design components and comprehensive form validation.
 *
 * @version 1.0.0
 */
@AndroidEntryPoint
class LoginFragment : BaseFragment() {

    private var _binding: FragmentLoginBinding? = null
    private val binding get() = _binding!!

    private val viewModel: AuthViewModel by viewModels()
    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private var loginAttempts = 0
    private val maxLoginAttempts = 5
    private val lockoutDurationMs = 300000L // 5 minutes

    private var lastLoginAttemptTime = 0L
    private var isNetworkAvailable = true

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLoginBinding.inflate(inflater, container, false)
        setupAccessibility()
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupFormValidation()
        setupBiometricAuth()
        setupClickListeners()
        observeViewModel()
        initializeNetworkMonitoring()
    }

    private fun setupFormValidation() {
        binding.emailInput.doAfterTextChanged { text ->
            validateEmail(text.toString())
        }

        binding.passwordInput.doAfterTextChanged { text ->
            validatePassword(text.toString())
        }
    }

    private fun setupBiometricAuth() {
        executor = ContextCompat.getMainExecutor(requireContext())
        
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                viewModel.authenticateWithBiometric()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                showError(BIOMETRIC.ERROR_MESSAGES.BIOMETRIC_ERROR_UNKNOWN)
            }
        }

        biometricPrompt = BiometricPrompt(this, executor, callback)

        viewModel.biometricAvailable.observe(viewLifecycleOwner) { isAvailable ->
            binding.biometricButton.visibility = if (isAvailable) View.VISIBLE else View.GONE
        }
    }

    private fun setupClickListeners() {
        binding.loginButton.setOnClickListener {
            if (validateForm()) {
                handleLogin()
            }
        }

        binding.biometricButton.setOnClickListener {
            showBiometricPrompt()
        }

        binding.forgotPasswordButton.setOnClickListener {
            // Navigate to forgot password flow
            Timber.d("Navigate to forgot password")
        }
    }

    private fun observeViewModel() {
        viewModel.loginState.observe(viewLifecycleOwner, Observer { state ->
            when (state) {
                is AuthState.Authenticated -> {
                    hideLoading()
                    // Navigate to main flow
                    Timber.d("Login successful, navigating to main flow")
                }
                is AuthState.Unauthenticated -> {
                    hideLoading()
                    handleLoginFailure()
                }
            }
        })

        viewModel.error.observe(viewLifecycleOwner, Observer { error ->
            error?.let {
                showError(it)
                hideLoading()
            }
        })
    }

    private fun validateForm(): Boolean {
        if (!isNetworkAvailable) {
            showError("No network connection available")
            return false
        }

        if (isRateLimited()) {
            showError("Too many login attempts. Please try again later.")
            return false
        }

        val email = binding.emailInput.text.toString()
        val password = binding.passwordInput.text.toString()

        return validateEmail(email) && validatePassword(password)
    }

    private fun validateEmail(email: String): Boolean {
        return if (email.matches(Regex(VALIDATION.EMAIL_PATTERN))) {
            binding.emailLayout.error = null
            true
        } else {
            binding.emailLayout.error = "Invalid email format"
            false
        }
    }

    private fun validatePassword(password: String): Boolean {
        return if (password.matches(Regex(VALIDATION.PASSWORD_PATTERN))) {
            binding.passwordLayout.error = null
            true
        } else {
            binding.passwordLayout.error = "Password must contain at least 8 characters, including uppercase, lowercase, number and special character"
            false
        }
    }

    private fun handleLogin() {
        if (!isNetworkAvailable) {
            showError("No network connection available")
            return
        }

        showLoading()
        loginAttempts++
        lastLoginAttemptTime = System.currentTimeMillis()

        viewModel.login(
            binding.emailInput.text.toString(),
            binding.passwordInput.text.toString(),
            binding.rememberMeCheckbox.isChecked
        )
    }

    private fun handleLoginFailure() {
        if (loginAttempts >= maxLoginAttempts) {
            showError("Account temporarily locked. Please try again later.")
            binding.loginButton.isEnabled = false
        }
    }

    private fun isRateLimited(): Boolean {
        if (loginAttempts >= maxLoginAttempts) {
            val timeElapsed = System.currentTimeMillis() - lastLoginAttemptTime
            if (timeElapsed < lockoutDurationMs) {
                return true
            }
            // Reset counter after lockout period
            loginAttempts = 0
        }
        return false
    }

    private fun showBiometricPrompt() {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(BIOMETRIC.PROMPT_TITLE)
            .setSubtitle(BIOMETRIC.PROMPT_SUBTITLE)
            .setDescription(BIOMETRIC.PROMPT_DESCRIPTION)
            .setNegativeButtonText("Cancel")
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    private fun setupAccessibility() {
        binding.root.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        binding.loginButton.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }

    private fun initializeNetworkMonitoring() {
        viewModel.networkAvailable.observe(viewLifecycleOwner) { available ->
            isNetworkAvailable = available
            binding.loginButton.isEnabled = available
            if (!available) {
                showError("No network connection available")
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        // Clear sensitive data
        binding.emailInput.text?.clear()
        binding.passwordInput.text?.clear()
        _binding = null
    }

    companion object {
        fun newInstance() = LoginFragment()
    }
}