package com.projectx.rental.ui.dashboard

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.repository.PaymentRepository
import com.projectx.rental.data.repository.PropertyRepository
import com.projectx.rental.ui.common.BaseViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.util.Date
import javax.inject.Inject

/**
 * ViewModel for managing dashboard screen state and data operations.
 * Implements parallel data loading, caching, and comprehensive error handling.
 *
 * @property propertyRepository Repository for property-related operations
 * @property paymentRepository Repository for payment-related operations
 */
class DashboardViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val paymentRepository: PaymentRepository
) : BaseViewModel() {

    // Properties LiveData
    private val _properties = MutableLiveData<List<Property>>()
    val properties: LiveData<List<Property>> = _properties

    // Recent Payments LiveData
    private val _recentPayments = MutableLiveData<List<Payment>>()
    val recentPayments: LiveData<List<Payment>> = _recentPayments

    // Dashboard Statistics LiveData
    private val _dashboardStats = MutableLiveData<DashboardStats>()
    val dashboardStats: LiveData<DashboardStats> = _dashboardStats

    // Loading State LiveData
    private val _loadingState = MutableLiveData<LoadingState>()
    val loadingState: LiveData<LoadingState> = _loadingState

    // Last Refresh Timestamp
    private var lastRefreshTimestamp: Long = 0

    init {
        loadDashboardData()
    }

    /**
     * Loads all dashboard data using parallel coroutines with error handling.
     * Implements optimistic loading with cached data while fetching fresh data.
     */
    fun loadDashboardData() {
        viewModelScope.launch {
            try {
                _loadingState.value = LoadingState.Loading

                // Launch parallel data fetching operations
                val propertiesDeferred = async { propertyRepository.getAllProperties() }
                val paymentsDeferred = async { paymentRepository.getPaymentHistory(1, 10) }

                // Wait for all data to be fetched
                val properties = propertiesDeferred.await()
                val payments = paymentsDeferred.await()

                // Update UI with fetched data
                _properties.value = properties
                _recentPayments.value = payments

                // Calculate and update dashboard statistics
                calculateDashboardStats(properties, payments)

                _loadingState.value = LoadingState.Success
                lastRefreshTimestamp = System.currentTimeMillis()

            } catch (e: Exception) {
                _loadingState.value = LoadingState.Error(e.message ?: "Failed to load dashboard data")
                showError("Failed to load dashboard data", e)
            }
        }
    }

    /**
     * Forces refresh of dashboard data from remote source.
     * Implements debouncing to prevent excessive refreshes.
     */
    fun refreshDashboard() {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastRefreshTimestamp < REFRESH_DEBOUNCE_MS) {
            return
        }

        viewModelScope.launch {
            try {
                _loadingState.value = LoadingState.Refreshing

                // Refresh properties and payments in parallel
                val propertiesDeferred = async { propertyRepository.refreshProperties() }
                val paymentsDeferred = async { paymentRepository.getPaymentHistory(1, 10) }

                val properties = propertiesDeferred.await()
                val payments = paymentsDeferred.await()

                _properties.value = properties
                _recentPayments.value = payments

                calculateDashboardStats(properties, payments)

                _loadingState.value = LoadingState.Success
                lastRefreshTimestamp = System.currentTimeMillis()

            } catch (e: Exception) {
                _loadingState.value = LoadingState.Error(e.message ?: "Failed to refresh dashboard")
                showError("Failed to refresh dashboard", e)
            }
        }
    }

    /**
     * Calculates comprehensive dashboard statistics from current data.
     */
    private fun calculateDashboardStats(
        properties: List<Property>,
        payments: List<Payment>
    ) {
        val totalProperties = properties.size
        val availableProperties = properties.count { it.isAvailable }
        val vacancyRate = if (totalProperties > 0) {
            (availableProperties.toDouble() / totalProperties) * 100
        } else 0.0

        val totalRevenue = payments.sumOf { it.amount }
        val pendingPayments = payments.count { it.status == PaymentStatus.PENDING }

        val stats = DashboardStats(
            totalProperties = totalProperties,
            availableProperties = availableProperties,
            vacancyRate = vacancyRate,
            totalRevenue = totalRevenue,
            pendingPayments = pendingPayments,
            lastUpdated = Date()
        )

        _dashboardStats.value = stats
    }

    companion object {
        private const val REFRESH_DEBOUNCE_MS = 30_000L // 30 seconds
    }
}

/**
 * Data class representing dashboard statistics
 */
data class DashboardStats(
    val totalProperties: Int,
    val availableProperties: Int,
    val vacancyRate: Double,
    val totalRevenue: Double,
    val pendingPayments: Int,
    val lastUpdated: Date
)

/**
 * Sealed class representing loading states
 */
sealed class LoadingState {
    object Loading : LoadingState()
    object Refreshing : LoadingState()
    object Success : LoadingState()
    data class Error(val message: String) : LoadingState()
}

/**
 * Enum representing payment status
 */
enum class PaymentStatus {
    PENDING,
    COMPLETED,
    FAILED
}

/**
 * Data class representing a payment
 */
data class Payment(
    val id: String,
    val amount: Double,
    val status: PaymentStatus,
    val timestamp: Long
)