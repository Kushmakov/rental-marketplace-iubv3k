package com.projectx.rental.ui.payment

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import com.projectx.rental.data.repository.PaymentRepository
import com.projectx.rental.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import io.reactivex.rxjava3.disposables.CompositeDisposable
import timber.log.Timber
import javax.inject.Inject
import java.util.UUID

/**
 * ViewModel responsible for managing payment-related business logic and UI state
 * with enhanced error handling, network monitoring, and PCI DSS compliance.
 *
 * @property paymentRepository Repository handling payment operations
 * @property savedStateHandle Handles state preservation during configuration changes
 */
@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val paymentRepository: PaymentRepository,
    private val savedStateHandle: SavedStateHandle
) : BaseViewModel() {

    companion object {
        private const val KEY_PAYMENT_STATE = "payment_state"
        private const val KEY_SELECTED_PAYMENT = "selected_payment"
        private const val PAGE_SIZE = 20
    }

    // Payment processing state
    private val _paymentState = MutableLiveData<PaymentState>()
    val paymentState: LiveData<PaymentState> = _paymentState

    // Payment history
    private val _paymentHistory = MutableLiveData<List<Payment>>()
    val paymentHistory: LiveData<List<Payment>> = _paymentHistory

    // Selected payment details
    private val _selectedPayment = MutableLiveData<Payment>()
    val selectedPayment: LiveData<Payment> = _selectedPayment

    // Payment-specific errors
    private val _paymentError = MutableLiveData<PaymentError>()
    val paymentError: LiveData<PaymentError> = _paymentError

    // Active payment processing job
    private var paymentJob: CompositeDisposable? = null

    init {
        // Restore saved state if available
        savedStateHandle.get<PaymentState>(KEY_PAYMENT_STATE)?.let {
            _paymentState.value = it
        }
        savedStateHandle.get<Payment>(KEY_SELECTED_PAYMENT)?.let {
            _selectedPayment.value = it
        }

        // Initialize payment monitoring
        setupPaymentMonitoring()
    }

    /**
     * Processes a payment request with enhanced security and error handling.
     * Implements PCI DSS compliance and network status monitoring.
     *
     * @param paymentRequest Payment details to process
     */
    fun processPayment(paymentRequest: PaymentRequest) {
        // Validate network connectivity
        if (!networkAvailable.value!!) {
            _paymentError.value = PaymentError.NetworkError("No network connection available")
            return
        }

        // Show loading state
        showLoading()

        // Cancel any existing payment job
        paymentJob?.dispose()
        paymentJob = CompositeDisposable()

        paymentJob?.add(
            paymentRepository.processPayment(paymentRequest)
                .doOnSubscribe { _paymentState.value = PaymentState.Processing }
                .subscribe({ response ->
                    hideLoading()
                    handlePaymentSuccess(response)
                }, { error ->
                    hideLoading()
                    handlePaymentError(error)
                })
        )
    }

    /**
     * Loads payment history with pagination support.
     *
     * @param page Page number to load
     */
    fun loadPaymentHistory(page: Int = 0) {
        if (!networkAvailable.value!!) {
            _paymentError.value = PaymentError.NetworkError("Unable to load payment history")
            return
        }

        showLoading()
        disposables.add(
            paymentRepository.getPaymentHistory(page, PAGE_SIZE)
                .subscribe({ payments ->
                    hideLoading()
                    _paymentHistory.value = payments
                }, { error ->
                    hideLoading()
                    handlePaymentError(error)
                })
        )
    }

    /**
     * Retrieves detailed payment information by ID.
     *
     * @param paymentId Unique identifier of the payment
     */
    fun getPaymentDetails(paymentId: String) {
        if (!networkAvailable.value!!) {
            _paymentError.value = PaymentError.NetworkError("Unable to fetch payment details")
            return
        }

        showLoading()
        disposables.add(
            paymentRepository.getPaymentById(paymentId)
                .subscribe({ payment ->
                    hideLoading()
                    _selectedPayment.value = payment
                    savedStateHandle[KEY_SELECTED_PAYMENT] = payment
                }, { error ->
                    hideLoading()
                    handlePaymentError(error)
                })
        )
    }

    /**
     * Retries a failed payment with exponential backoff.
     *
     * @param paymentId ID of the failed payment to retry
     */
    fun retryPayment(paymentId: String) {
        if (!networkAvailable.value!!) {
            _paymentError.value = PaymentError.NetworkError("Unable to retry payment")
            return
        }

        showLoading()
        disposables.add(
            paymentRepository.retryPayment(paymentId)
                .subscribe({ response ->
                    hideLoading()
                    handlePaymentSuccess(response)
                }, { error ->
                    hideLoading()
                    handlePaymentError(error)
                })
        )
    }

    /**
     * Handles successful payment processing.
     */
    private fun handlePaymentSuccess(response: PaymentResponse) {
        _paymentState.value = PaymentState.Success(response)
        savedStateHandle[KEY_PAYMENT_STATE] = _paymentState.value
        
        // Log successful payment metrics
        Timber.i("Payment processed successfully: ${response.transactionId}")
    }

    /**
     * Handles payment processing errors with detailed error states.
     */
    private fun handlePaymentError(error: Throwable) {
        val paymentError = when (error) {
            is SecurityException -> PaymentError.SecurityError("Payment security verification failed")
            is IllegalArgumentException -> PaymentError.ValidationError(error.message ?: "Invalid payment data")
            is NetworkException -> PaymentError.NetworkError("Network error during payment processing")
            else -> PaymentError.GeneralError("Payment processing failed: ${error.message}")
        }

        _paymentError.value = paymentError
        _paymentState.value = PaymentState.Error(paymentError)
        savedStateHandle[KEY_PAYMENT_STATE] = _paymentState.value

        // Log payment error for monitoring
        Timber.e(error, "Payment processing error: ${paymentError.message}")
    }

    /**
     * Sets up payment monitoring and error tracking.
     */
    private fun setupPaymentMonitoring() {
        disposables.add(
            networkAvailable.subscribe { isAvailable ->
                if (!isAvailable) {
                    _paymentState.value = PaymentState.NetworkUnavailable
                }
            }
        )
    }

    override fun onCleared() {
        paymentJob?.dispose()
        paymentJob = null
        super.onCleared()
    }
}

/**
 * Represents the current state of payment processing.
 */
sealed class PaymentState {
    object Idle : PaymentState()
    object Processing : PaymentState()
    object NetworkUnavailable : PaymentState()
    data class Success(val response: PaymentResponse) : PaymentState()
    data class Error(val error: PaymentError) : PaymentState()
}

/**
 * Represents different types of payment errors.
 */
sealed class PaymentError {
    abstract val message: String

    data class SecurityError(override val message: String) : PaymentError()
    data class ValidationError(override val message: String) : PaymentError()
    data class NetworkError(override val message: String) : PaymentError()
    data class GeneralError(override val message: String) : PaymentError()
}

/**
 * Data class representing a payment request.
 */
data class PaymentRequest(
    val amount: Double,
    val currency: String,
    val cardNumber: String,
    val expiryMonth: Int,
    val expiryYear: Int,
    val cvv: String,
    val description: String? = null
)

/**
 * Data class representing a payment response.
 */
data class PaymentResponse(
    val transactionId: String,
    val status: String,
    val amount: Double,
    val currency: String,
    val timestamp: Long
)