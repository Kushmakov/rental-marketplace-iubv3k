package com.projectx.rental.ui.dashboard

import android.os.Bundle
import android.view.View
import androidx.activity.viewModels
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.snackbar.Snackbar
import com.projectx.rental.R
import com.projectx.rental.databinding.ActivityDashboardBinding
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.data.db.entities.Property
import dagger.hilt.android.AndroidEntryPoint
import java.text.NumberFormat
import javax.inject.Inject
import timber.log.Timber

/**
 * Dashboard activity displaying property listings, recent activities, and key statistics.
 * Implements efficient data loading, caching, and comprehensive error handling.
 *
 * @version 1.0
 */
@AndroidEntryPoint
class DashboardActivity : BaseActivity() {

    private lateinit var binding: ActivityDashboardBinding
    
    @Inject
    lateinit var propertyAdapter: PropertyAdapter
    
    @Inject
    lateinit var paymentAdapter: PaymentAdapter
    
    private val viewModel: DashboardViewModel by viewModels()
    
    private val currencyFormatter = NumberFormat.getCurrencyInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerViews()
        setupSwipeRefresh()
        setupObservers()
        setupErrorHandling()

        // Initial data load
        viewModel.loadDashboardData()
    }

    private fun setupRecyclerViews() {
        // Properties RecyclerView
        binding.rvProperties.apply {
            layoutManager = LinearLayoutManager(this@DashboardActivity, 
                LinearLayoutManager.HORIZONTAL, false)
            adapter = propertyAdapter
            setHasFixedSize(true)
            addItemDecoration(PropertyItemDecoration(
                resources.getDimensionPixelSize(R.dimen.property_item_spacing)))
        }

        // Recent Payments RecyclerView
        binding.rvRecentPayments.apply {
            layoutManager = LinearLayoutManager(this@DashboardActivity)
            adapter = paymentAdapter
            setHasFixedSize(true)
            addItemDecoration(PaymentItemDecoration(
                resources.getDimensionPixelSize(R.dimen.payment_item_spacing)))
        }

        // Click listeners
        propertyAdapter.setOnItemClickListener { property ->
            navigateToPropertyDetails(property)
        }

        paymentAdapter.setOnItemClickListener { payment ->
            navigateToPaymentDetails(payment)
        }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefreshLayout.apply {
            setColorSchemeResources(R.color.primary, R.color.secondary)
            setOnRefreshListener { refreshDashboard() }
        }
    }

    private fun setupObservers() {
        // Properties observer
        viewModel.properties.observe(this) { properties ->
            propertyAdapter.submitList(properties)
            updatePropertiesVisibility(properties)
        }

        // Recent payments observer
        viewModel.recentPayments.observe(this) { payments ->
            paymentAdapter.submitList(payments)
            updatePaymentsVisibility(payments)
        }

        // Dashboard stats observer
        viewModel.dashboardStats.observe(this) { stats ->
            updateDashboardStats(stats)
        }

        // Loading state observer
        viewModel.loadingState.observe(this) { state ->
            handleLoadingState(state)
        }
    }

    private fun setupErrorHandling() {
        viewModel.error.observe(this) { error ->
            error?.let {
                showError(ErrorType.GENERAL, it)
                binding.swipeRefreshLayout.isRefreshing = false
            }
        }
    }

    private fun refreshDashboard() {
        binding.swipeRefreshLayout.isRefreshing = true
        viewModel.refreshDashboard()
    }

    private fun updateDashboardStats(stats: DashboardStats) {
        binding.apply {
            tvTotalProperties.text = stats.totalProperties.toString()
            tvAvailableProperties.text = stats.availableProperties.toString()
            tvVacancyRate.text = String.format("%.1f%%", stats.vacancyRate)
            tvTotalRevenue.text = currencyFormatter.format(stats.totalRevenue)
            tvPendingPayments.text = stats.pendingPayments.toString()
            tvLastUpdated.text = getString(R.string.last_updated_format, 
                stats.lastUpdated.toString())
        }
    }

    private fun handleLoadingState(state: LoadingState) {
        when (state) {
            is LoadingState.Loading -> {
                showLoading()
                binding.contentLayout.alpha = 0.5f
            }
            is LoadingState.Refreshing -> {
                binding.swipeRefreshLayout.isRefreshing = true
            }
            is LoadingState.Success -> {
                hideLoading()
                binding.swipeRefreshLayout.isRefreshing = false
                binding.contentLayout.alpha = 1.0f
            }
            is LoadingState.Error -> {
                hideLoading()
                binding.swipeRefreshLayout.isRefreshing = false
                binding.contentLayout.alpha = 1.0f
                showError(ErrorType.GENERAL, state.message)
            }
        }
    }

    private fun updatePropertiesVisibility(properties: List<Property>) {
        binding.rvProperties.visibility = if (properties.isEmpty()) View.GONE else View.VISIBLE
        binding.tvNoProperties.visibility = if (properties.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun updatePaymentsVisibility(payments: List<Payment>) {
        binding.rvRecentPayments.visibility = if (payments.isEmpty()) View.GONE else View.VISIBLE
        binding.tvNoPayments.visibility = if (payments.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun navigateToPropertyDetails(property: Property) {
        try {
            startActivity(PropertyDetailsActivity.createIntent(this, property))
        } catch (e: Exception) {
            Timber.e(e, "Error navigating to property details")
            showError(ErrorType.GENERAL, getString(R.string.error_navigation))
        }
    }

    private fun navigateToPaymentDetails(payment: Payment) {
        try {
            startActivity(PaymentDetailsActivity.createIntent(this, payment))
        } catch (e: Exception) {
            Timber.e(e, "Error navigating to payment details")
            showError(ErrorType.GENERAL, getString(R.string.error_navigation))
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // Save RecyclerView scroll positions
        outState.putParcelable(KEY_PROPERTIES_STATE, 
            binding.rvProperties.layoutManager?.onSaveInstanceState())
        outState.putParcelable(KEY_PAYMENTS_STATE, 
            binding.rvRecentPayments.layoutManager?.onSaveInstanceState())
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        // Restore RecyclerView scroll positions
        savedInstanceState.getParcelable<RecyclerView.SavedState>(KEY_PROPERTIES_STATE)?.let {
            binding.rvProperties.layoutManager?.onRestoreInstanceState(it)
        }
        savedInstanceState.getParcelable<RecyclerView.SavedState>(KEY_PAYMENTS_STATE)?.let {
            binding.rvRecentPayments.layoutManager?.onRestoreInstanceState(it)
        }
    }

    companion object {
        private const val KEY_PROPERTIES_STATE = "properties_state"
        private const val KEY_PAYMENTS_STATE = "payments_state"
    }
}