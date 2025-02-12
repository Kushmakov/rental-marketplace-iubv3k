package com.projectx.rental.ui.auth

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.viewModels
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputLayout
import com.projectx.rental.R
import com.projectx.rental.ui.common.BaseFragment
import com.projectx.rental.util.Constants.VALIDATION
import com.projectx.rental.util.Constants.BIOMETRIC
import com.projectx.rental.util.SecurityUtils
import java.util.concurrent.Executor
import java.util.regex.Pattern
import timber.log.Timber

/**
 * Fragment responsible for secure user registration with comprehensive validation
 * and biometric authentication support.
 *
 * @version 1.0
 */
class SignupFragment : BaseFragment() {

    override val viewModel: AuthViewModel by viewModels()
    
    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    // View bindings
    private lateinit var emailInput: TextInputLayout
    private lateinit var passwordInput: TextInputLayout
    private lateinit var confirmPasswordInput: TextInputLayout
    private lateinit var firstNameInput: TextInputLayout
    private lateinit var lastNameInput: TextInputLayout
    private lateinit var phoneInput: TextInputLayout
    private lateinit var signupButton: MaterialButton
    private lateinit var biometricButton: MaterialButton

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val view = inflater.inflate(R.layout.fragment_signup, container, false)
        
        initializeViews(view)
        setupInputValidation()
        setupBiometricAuth()
        setupSignupButton()
        
        return view
    }

    private fun initializeViews(view: View) {
        emailInput = view.findViewById(R.id.email_input)
        passwordInput = view.findViewById(R.id.password_input)
        confirmPasswordInput = view.findViewById(R.id.confirm_password_input)
        firstNameInput = view.findViewById(R.id.first_name_input)
        lastNameInput = view.findViewById(R.id.last_name_input)
        phoneInput = view.findViewById(R.id.phone_input)
        signupButton = view.findViewById(R.id.signup_button)
        biometricButton = view.findViewById(R.id.biometric_button)
    }

    private fun setupInputValidation() {
        emailInput.editText?.doAfterTextChanged { 
            validateEmail(it.toString())
        }

        passwordInput.editText?.doAfterTextChanged {
            validatePassword(it.toString())
        }

        confirmPasswordInput.editText?.doAfterTextChanged {
            validatePasswordMatch(
                passwordInput.editText?.text.toString(),
                it.toString()
            )
        }

        phoneInput.editText?.doAfterTextChanged {
            validatePhone(it.toString())
        }
    }

    private fun setupBiometricAuth() {
        executor = ContextCompat.getMainExecutor(requireContext())
        
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    handleBiometricSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    handleBiometricError(errorCode, errString)
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(BIOMETRIC.PROMPT_TITLE)
            .setSubtitle(BIOMETRIC.PROMPT_SUBTITLE)
            .setDescription(BIOMETRIC.PROMPT_DESCRIPTION)
            .setNegativeButtonText(getString(R.string.cancel))
            .build()

        // Only show biometric button if hardware is available and biometrics are enrolled
        val biometricManager = BiometricManager.from(requireContext())
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> biometricButton.visibility = View.VISIBLE
            else -> biometricButton.visibility = View.GONE
        }

        biometricButton.setOnClickListener {
            biometricPrompt.authenticate(promptInfo)
        }
    }

    private fun setupSignupButton() {
        signupButton.setOnClickListener {
            if (validateInputs()) {
                handleSignup()
            }
        }
    }

    private fun validateInputs(): Boolean {
        var isValid = true

        // Required fields validation
        if (firstNameInput.editText?.text.isNullOrBlank()) {
            firstNameInput.error = getString(R.string.error_required_field)
            isValid = false
        }

        if (lastNameInput.editText?.text.isNullOrBlank()) {
            lastNameInput.error = getString(R.string.error_required_field)
            isValid = false
        }

        // Email validation
        if (!validateEmail(emailInput.editText?.text.toString())) {
            isValid = false
        }

        // Password validation
        if (!validatePassword(passwordInput.editText?.text.toString())) {
            isValid = false
        }

        // Password match validation
        if (!validatePasswordMatch(
            passwordInput.editText?.text.toString(),
            confirmPasswordInput.editText?.text.toString()
        )) {
            isValid = false
        }

        // Phone validation
        if (!validatePhone(phoneInput.editText?.text.toString())) {
            isValid = false
        }

        return isValid
    }

    private fun validateEmail(email: String): Boolean {
        return if (email.isEmpty()) {
            emailInput.error = getString(R.string.error_required_field)
            false
        } else if (!Pattern.matches(VALIDATION.EMAIL_PATTERN, email)) {
            emailInput.error = getString(R.string.error_invalid_email)
            false
        } else {
            emailInput.error = null
            true
        }
    }

    private fun validatePassword(password: String): Boolean {
        return if (password.isEmpty()) {
            passwordInput.error = getString(R.string.error_required_field)
            false
        } else if (!Pattern.matches(VALIDATION.PASSWORD_PATTERN, password)) {
            passwordInput.error = getString(R.string.error_invalid_password)
            false
        } else {
            passwordInput.error = null
            true
        }
    }

    private fun validatePasswordMatch(password: String, confirmPassword: String): Boolean {
        return if (confirmPassword.isEmpty()) {
            confirmPasswordInput.error = getString(R.string.error_required_field)
            false
        } else if (password != confirmPassword) {
            confirmPasswordInput.error = getString(R.string.error_password_mismatch)
            false
        } else {
            confirmPasswordInput.error = null
            true
        }
    }

    private fun validatePhone(phone: String): Boolean {
        return if (phone.isEmpty()) {
            phoneInput.error = getString(R.string.error_required_field)
            false
        } else if (!Pattern.matches(VALIDATION.PHONE_PATTERN, phone)) {
            phoneInput.error = getString(R.string.error_invalid_phone)
            false
        } else {
            phoneInput.error = null
            true
        }
    }

    private fun handleSignup() {
        showLoading()
        
        try {
            // Encrypt sensitive data before transmission
            val encryptedPassword = SecurityUtils.encryptData(
                passwordInput.editText?.text.toString()
            )

            val signupData = hashMapOf(
                "email" to emailInput.editText?.text.toString(),
                "password" to encryptedPassword,
                "firstName" to firstNameInput.editText?.text.toString(),
                "lastName" to lastNameInput.editText?.text.toString(),
                "phone" to phoneInput.editText?.text.toString()
            )

            viewModel.signup(signupData).observe(viewLifecycleOwner) { result ->
                hideLoading()
                result.onSuccess {
                    clearSensitiveData()
                    navigateToVerification()
                }.onFailure { error ->
                    showError(error.message ?: getString(R.string.error_signup_failed))
                    Timber.e(error)
                }
            }
        } catch (e: Exception) {
            hideLoading()
            showError(getString(R.string.error_signup_failed))
            Timber.e(e)
        }
    }

    private fun handleBiometricSuccess() {
        // Implement biometric enrollment logic
        viewModel.enrollBiometric().observe(viewLifecycleOwner) { result ->
            result.onSuccess {
                showMessage(getString(R.string.biometric_enrollment_success))
            }.onFailure { error ->
                showError(error.message ?: getString(R.string.error_biometric_enrollment))
                Timber.e(error)
            }
        }
    }

    private fun handleBiometricError(errorCode: Int, errString: CharSequence) {
        val errorMessage = when (errorCode) {
            BiometricPrompt.ERROR_HW_NOT_PRESENT -> BIOMETRIC.ERROR_MESSAGES.HARDWARE_UNAVAILABLE
            BiometricPrompt.ERROR_HW_UNAVAILABLE -> BIOMETRIC.ERROR_MESSAGES.HARDWARE_UNAVAILABLE
            BiometricPrompt.ERROR_NO_BIOMETRICS -> BIOMETRIC.ERROR_MESSAGES.NO_BIOMETRICS_ENROLLED
            else -> BIOMETRIC.ERROR_MESSAGES.BIOMETRIC_ERROR_UNKNOWN
        }
        showError(errorMessage)
        Timber.e("Biometric error: $errorCode - $errString")
    }

    private fun clearSensitiveData() {
        passwordInput.editText?.text?.clear()
        confirmPasswordInput.editText?.text?.clear()
        // Explicitly request garbage collection for sensitive data
        System.gc()
    }

    private fun navigateToVerification() {
        // Navigate to email verification screen
        // Implementation depends on navigation setup
    }

    override fun onDestroyView() {
        clearSensitiveData()
        super.onDestroyView()
    }
}