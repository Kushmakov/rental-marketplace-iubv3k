package com.projectx.rental.data.repository

import com.projectx.rental.data.api.ApiService
import com.stripe.security.PaymentEncryption
import androidx.room.Room
import io.reactivex.rxjava3.core.Single
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository class handling payment operations with PCI DSS compliance.
 * Implements secure payment processing with local caching and encryption.
 *
 * @property apiService API service for remote payment operations
 * @property paymentDao Local database access for payment data
 * @property paymentEncryption Encryption utilities for sensitive payment data
 *
 * @version stripe-security:1.5.0
 * @version room:2.5.0
 * @version rxjava3:3.1.5
 */
@Singleton
class PaymentRepository @Inject constructor(
    private val apiService: ApiService,
    private val paymentDao: PaymentDao,
    private val paymentEncryption: PaymentEncryption
) {
    companion object {
        private const val CACHE_EXPIRY_HOURS = 24
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val RETRY_DELAY_MS = 1000L
    }

    /**
     * Processes a payment with PCI DSS compliance and encryption.
     * Implements retry mechanism for failed transactions.
     *
     * @param paymentRequest Payment request containing transaction details
     * @return Single<PaymentResponse> Observable payment processing result
     */
    fun processPayment(paymentRequest: PaymentRequest): Single<PaymentResponse> {
        return Single.create { emitter ->
            try {
                // Validate payment request
                validatePaymentRequest(paymentRequest)

                // Encrypt sensitive payment data
                val encryptedRequest = encryptPaymentData(paymentRequest)

                // Process payment with retry mechanism
                apiService.processPayment(encryptedRequest)
                    .retry(MAX_RETRY_ATTEMPTS, { attempt, throwable ->
                        shouldRetryPayment(attempt, throwable)
                    })
                    .subscribe({ response ->
                        // Cache successful payment
                        cachePaymentResponse(response)
                        emitter.onSuccess(response)
                    }, { error ->
                        emitter.onError(handlePaymentError(error))
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Retrieves payment history with caching support.
     * Returns cached data if available and fresh, otherwise fetches from remote.
     *
     * @param page Page number for pagination
     * @param limit Number of items per page
     * @return Single<List<Payment>> Observable list of payment records
     */
    fun getPaymentHistory(page: Int, limit: Int): Single<List<Payment>> {
        return Single.create { emitter ->
            try {
                // Check cache first
                val cachedPayments = paymentDao.getPayments(page, limit)
                
                if (isCacheValid(cachedPayments)) {
                    emitter.onSuccess(cachedPayments)
                    return@create
                }

                // Fetch from remote if cache miss or stale
                apiService.getPaymentHistory(page, limit)
                    .subscribe({ payments ->
                        // Update cache
                        paymentDao.insertAll(payments)
                        emitter.onSuccess(payments)
                    }, { error ->
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Retrieves specific payment details by ID.
     * Implements caching with encryption for sensitive data.
     *
     * @param paymentId Unique payment identifier
     * @return Single<Payment> Observable payment details
     */
    fun getPaymentById(paymentId: String): Single<Payment> {
        return Single.create { emitter ->
            try {
                // Validate payment ID
                if (!isValidPaymentId(paymentId)) {
                    throw IllegalArgumentException("Invalid payment ID format")
                }

                // Check cache first
                val cachedPayment = paymentDao.getPaymentById(paymentId)
                
                if (cachedPayment != null && isCacheValid(cachedPayment)) {
                    emitter.onSuccess(decryptPaymentData(cachedPayment))
                    return@create
                }

                // Fetch from remote if cache miss
                apiService.getPaymentById(paymentId)
                    .subscribe({ payment ->
                        // Cache payment data
                        paymentDao.insert(payment)
                        emitter.onSuccess(decryptPaymentData(payment))
                    }, { error ->
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Validates payment request data according to PCI DSS requirements.
     */
    private fun validatePaymentRequest(request: PaymentRequest) {
        if (!isValidCardNumber(request.cardNumber)) {
            throw IllegalArgumentException("Invalid card number")
        }
        if (!isValidExpiryDate(request.expiryMonth, request.expiryYear)) {
            throw IllegalArgumentException("Invalid expiry date")
        }
        if (!isValidCVV(request.cvv)) {
            throw IllegalArgumentException("Invalid CVV")
        }
        if (request.amount <= 0) {
            throw IllegalArgumentException("Invalid payment amount")
        }
    }

    /**
     * Encrypts sensitive payment data using PCI DSS compliant encryption.
     */
    private fun encryptPaymentData(request: PaymentRequest): EncryptedPaymentRequest {
        return EncryptedPaymentRequest(
            cardNumber = paymentEncryption.encrypt(request.cardNumber),
            expiryMonth = request.expiryMonth,
            expiryYear = request.expiryYear,
            cvv = paymentEncryption.encrypt(request.cvv),
            amount = request.amount,
            currency = request.currency,
            description = request.description
        )
    }

    /**
     * Decrypts sensitive payment data for display.
     */
    private fun decryptPaymentData(payment: Payment): Payment {
        return payment.copy(
            cardNumber = paymentEncryption.decrypt(payment.cardNumber),
            cvv = paymentEncryption.decrypt(payment.cvv)
        )
    }

    /**
     * Determines if payment processing should be retried based on error type.
     */
    private fun shouldRetryPayment(attempt: Int, error: Throwable): Boolean {
        return when {
            attempt >= MAX_RETRY_ATTEMPTS -> false
            error is NetworkException -> true
            error is TimeoutException -> true
            else -> false
        }
    }

    /**
     * Handles payment processing errors with appropriate error messages.
     */
    private fun handlePaymentError(error: Throwable): PaymentException {
        return when (error) {
            is NetworkException -> PaymentException("Network error during payment processing")
            is TimeoutException -> PaymentException("Payment processing timed out")
            is SecurityException -> PaymentException("Payment security verification failed")
            else -> PaymentException("Payment processing failed: ${error.message}")
        }
    }

    /**
     * Checks if cached payment data is still valid.
     */
    private fun isCacheValid(data: Any?): Boolean {
        if (data == null) return false
        
        return when (data) {
            is Payment -> {
                val cacheAge = System.currentTimeMillis() - data.timestamp
                cacheAge < CACHE_EXPIRY_HOURS * 3600 * 1000
            }
            is List<*> -> {
                if (data.isEmpty()) return false
                val latestTimestamp = (data.first() as? Payment)?.timestamp ?: return false
                val cacheAge = System.currentTimeMillis() - latestTimestamp
                cacheAge < CACHE_EXPIRY_HOURS * 3600 * 1000
            }
            else -> false
        }
    }

    /**
     * Validates payment ID format.
     */
    private fun isValidPaymentId(paymentId: String): Boolean {
        return paymentId.matches(Regex("^[A-Za-z0-9-]+$"))
    }

    /**
     * Validates credit card number using Luhn algorithm.
     */
    private fun isValidCardNumber(cardNumber: String): Boolean {
        return cardNumber.matches(Regex("^[0-9]{13,19}$")) && checkLuhn(cardNumber)
    }

    /**
     * Validates expiry date is in the future.
     */
    private fun isValidExpiryDate(month: Int, year: Int): Boolean {
        val currentYear = java.time.Year.now().value % 100
        val currentMonth = java.time.MonthDay.now().monthValue
        
        return when {
            month !in 1..12 -> false
            year < currentYear -> false
            year == currentYear && month < currentMonth -> false
            else -> true
        }
    }

    /**
     * Validates CVV format.
     */
    private fun isValidCVV(cvv: String): Boolean {
        return cvv.matches(Regex("^[0-9]{3,4}$"))
    }

    /**
     * Implements Luhn algorithm for card number validation.
     */
    private fun checkLuhn(cardNumber: String): Boolean {
        var sum = 0
        var alternate = false
        
        for (i in cardNumber.length - 1 downTo 0) {
            var n = cardNumber[i].toString().toInt()
            if (alternate) {
                n *= 2
                if (n > 9) {
                    n = (n % 10) + 1
                }
            }
            sum += n
            alternate = !alternate
        }
        
        return sum % 10 == 0
    }
}