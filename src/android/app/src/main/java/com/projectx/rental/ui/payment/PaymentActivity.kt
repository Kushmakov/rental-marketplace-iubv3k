package com.projectx.rental.ui.payment

import android.os.Bundle
import android.view.View
import androidx.activity.viewModels
import androidx.lifecycle.Observer
import androidx.viewbinding.ViewBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.databinding.ActivityPaymentBinding
import com.stripe.android.Stripe
import com.stripe.android.model.ConfirmPaymentIntentParams
import com.stripe.android.model.PaymentMethodCreateParams
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import timber.log.Timber
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Activity handling secure payment processing with PCI DSS compliance.
 * Implements comprehensive error handling and network state monitoring.
 *
 * @version stripe-android:20.28.3
 */
@AndroidEntryPoint
class PaymentActivity : BaseActivity() {

    private lateinit var binding: ActivityPaymentBinding
    private val viewModel: PaymentViewModel by viewModels()

    @Inject
    lateinit var stripe: Stripe

    private var currentPaymentAmount: Double = 0.0
    private val currencyFormatter = NumberFormat.getCurrencyInstance(Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize secure view binding
        binding = ActivityPaymentBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Set up toolbar with security info
        setupSecureToolbar()

        // Initialize payment observers
        setupSecureObservers()

        // Set up secure click listeners
        setupSecureClickListeners()

        // Load initial payment data
        loadInitialPaymentData()
    }

    private fun setupSecureToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            title = "Secure Payment"
        }
    }

    private fun setupSecureObservers() {
        // Observe payment state changes
        viewModel.paymentState.observe(this, Observer { state ->
            when (state) {
                is PaymentState.Processing -> {
                    showLoading()
                    disablePaymentInputs()
                }
                is PaymentState.Success -> {
                    hideLoading()
                    showPaymentSuccess(state.response)
                    clearSensitiveData()
                }
                is PaymentState.Error -> {
                    hideLoading()
                    handlePaymentError(state.error)
                    enablePaymentInputs()
                }
                is PaymentState.NetworkUnavailable -> {
                    hideLoading()
                    showError(ErrorType.NETWORK, "Network connection required for secure payment processing")
                    enablePaymentInputs()
                }
                else -> {
                    hideLoading()
                    enablePaymentInputs()
                }
            }
        })

        // Observe payment history
        viewModel.paymentHistory.observe(this, Observer { payments ->
            binding.paymentHistoryRecyclerView.adapter = PaymentHistoryAdapter(payments)
        })

        // Monitor network state
        viewModel.networkState.observe(this, Observer { isAvailable ->
            binding.networkStatusBanner.visibility = if (!isAvailable) View.VISIBLE else View.GONE
        })
    }

    private fun setupSecureClickListeners() {
        binding.submitPaymentButton.setOnClickListener {
            if (validatePaymentInputs()) {
                processSecurePayment()
            }
        }

        binding.clearFormButton.setOnClickListener {
            clearPaymentForm()
        }
    }

    private fun processSecurePayment() {
        val cardNumber = binding.cardNumberInput.text.toString()
        val expiryMonth = binding.expiryMonthInput.text.toString().toInt()
        val expiryYear = binding.expiryYearInput.text.toString().toInt()
        val cvv = binding.cvvInput.text.toString()

        val paymentRequest = PaymentRequest(
            amount = currentPaymentAmount,
            currency = "USD",
            cardNumber = cardNumber,
            expiryMonth = expiryMonth,
            expiryYear = expiryYear,
            cvv = cvv,
            description = "Rental Payment"
        )

        viewModel.processPayment(paymentRequest)
    }

    private fun validatePaymentInputs(): Boolean {
        var isValid = true

        // Validate card number
        if (!isValidCardNumber(binding.cardNumberInput.text.toString())) {
            binding.cardNumberLayout.error = "Invalid card number"
            isValid = false
        }

        // Validate expiry date
        val month = binding.expiryMonthInput.text.toString()
        val year = binding.expiryYearInput.text.toString()
        if (!isValidExpiryDate(month, year)) {
            binding.expiryDateLayout.error = "Invalid expiry date"
            isValid = false
        }

        // Validate CVV
        if (!isValidCVV(binding.cvvInput.text.toString())) {
            binding.cvvLayout.error = "Invalid CVV"
            isValid = false
        }

        return isValid
    }

    private fun isValidCardNumber(cardNumber: String): Boolean {
        return cardNumber.matches(Regex("^[0-9]{13,19}$"))
    }

    private fun isValidExpiryDate(month: String, year: String): Boolean {
        return try {
            val monthInt = month.toInt()
            val yearInt = year.toInt()
            monthInt in 1..12 && yearInt >= java.time.Year.now().value % 100
        } catch (e: NumberFormatException) {
            false
        }
    }

    private fun isValidCVV(cvv: String): Boolean {
        return cvv.matches(Regex("^[0-9]{3,4}$"))
    }

    private fun showPaymentSuccess(response: PaymentResponse) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Payment Successful")
            .setMessage("Transaction ID: ${response.transactionId}\nAmount: ${currencyFormatter.format(response.amount)}")
            .setPositiveButton("OK") { _, _ ->
                finish()
            }
            .setCancelable(false)
            .show()
    }

    private fun handlePaymentError(error: PaymentError) {
        val errorMessage = when (error) {
            is PaymentError.SecurityError -> "Payment security verification failed"
            is PaymentError.ValidationError -> error.message
            is PaymentError.NetworkError -> "Network error during payment processing"
            is PaymentError.GeneralError -> "Payment processing failed: ${error.message}"
        }
        
        showError(ErrorType.GENERAL, errorMessage)
        Timber.e("Payment Error: $errorMessage")
    }

    private fun enablePaymentInputs() {
        binding.cardNumberInput.isEnabled = true
        binding.expiryMonthInput.isEnabled = true
        binding.expiryYearInput.isEnabled = true
        binding.cvvInput.isEnabled = true
        binding.submitPaymentButton.isEnabled = true
    }

    private fun disablePaymentInputs() {
        binding.cardNumberInput.isEnabled = false
        binding.expiryMonthInput.isEnabled = false
        binding.expiryYearInput.isEnabled = false
        binding.cvvInput.isEnabled = false
        binding.submitPaymentButton.isEnabled = false
    }

    private fun clearPaymentForm() {
        binding.cardNumberInput.text?.clear()
        binding.expiryMonthInput.text?.clear()
        binding.expiryYearInput.text?.clear()
        binding.cvvInput.text?.clear()
        
        binding.cardNumberLayout.error = null
        binding.expiryDateLayout.error = null
        binding.cvvLayout.error = null
    }

    private fun clearSensitiveData() {
        binding.cardNumberInput.text?.clear()
        binding.cvvInput.text?.clear()
    }

    private fun loadInitialPaymentData() {
        intent.getDoubleExtra(EXTRA_PAYMENT_AMOUNT, 0.0).let { amount ->
            currentPaymentAmount = amount
            binding.paymentAmountText.text = currencyFormatter.format(amount)
        }
        
        viewModel.loadPaymentHistory()
    }

    override fun onDestroy() {
        clearSensitiveData()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PAYMENT_AMOUNT = "extra_payment_amount"
    }
}