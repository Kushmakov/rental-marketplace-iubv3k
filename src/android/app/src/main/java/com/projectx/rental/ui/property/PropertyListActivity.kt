package com.projectx.rental.ui.property

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.view.View
import android.view.accessibility.AccessibilityEvent
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.paging.LoadState
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.material.chip.ChipGroup
import com.google.android.material.snackbar.Snackbar
import com.projectx.rental.R
import com.projectx.rental.data.repository.PropertySearchFilters
import com.projectx.rental.databinding.ActivityPropertyListBinding
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.ui.property.adapter.PropertyPagingAdapter
import com.projectx.rental.util.NetworkUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Activity for displaying and managing the list of rental properties.
 * Implements enhanced features including offline support, accessibility improvements,
 * and optimized performance through paging and caching.
 */
@AndroidEntryPoint
class PropertyListActivity : BaseActivity() {

    private lateinit var binding: ActivityPropertyListBinding
    
    @Inject
    lateinit var workManager: WorkManager
    
    private val viewModel: PropertyListViewModel by viewModels()
    private lateinit var propertyAdapter: PropertyPagingAdapter
    private lateinit var connectivityManager: ConnectivityManager
    private var isOfflineMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPropertyListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        initializeViews()
        setupRecyclerView()
        setupSwipeRefresh()
        setupFilterChips()
        setupConnectivityMonitoring()
        collectViewModelState()
        scheduleBackgroundSync()
    }

    private fun initializeViews() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        
        binding.toolbar.setNavigationOnClickListener { onBackPressed() }
        
        // Set content descriptions for accessibility
        binding.swipeRefresh.contentDescription = getString(R.string.refresh_property_list)
        binding.filterChipGroup.contentDescription = getString(R.string.property_filters)
    }

    private fun setupRecyclerView() {
        propertyAdapter = PropertyPagingAdapter(
            onPropertyClick = { property ->
                // Handle property click with accessibility announcement
                binding.root.announceForAccessibility(
                    getString(R.string.selected_property, property.name)
                )
                navigateToPropertyDetail(property.id)
            }
        )

        val spanCount = calculateOptimalSpanCount()
        val layoutManager = GridLayoutManager(this, spanCount).apply {
            spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                override fun getSpanSize(position: Int): Int {
                    return when (propertyAdapter.getItemViewType(position)) {
                        R.layout.item_property -> 1
                        else -> spanCount
                    }
                }
            }
        }

        binding.recyclerView.apply {
            this.layoutManager = layoutManager
            adapter = propertyAdapter
            setHasFixedSize(true)
            
            // Optimize RecyclerView performance
            setItemViewCacheSize(20)
            recycledViewPool.setMaxRecycledViews(R.layout.item_property, 20)
        }

        // Add load state handling
        propertyAdapter.addLoadStateListener { loadState ->
            when (loadState.refresh) {
                is LoadState.Loading -> showLoading()
                is LoadState.Error -> {
                    hideLoading()
                    val error = (loadState.refresh as LoadState.Error).error
                    handleLoadError(error)
                }
                is LoadState.NotLoading -> {
                    hideLoading()
                    if (propertyAdapter.itemCount == 0) {
                        showEmptyState()
                    }
                }
            }
        }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.apply {
            setOnRefreshListener {
                viewModel.refreshProperties()
            }
            setColorSchemeResources(R.color.colorPrimary)
        }
    }

    private fun setupFilterChips() {
        binding.filterChipGroup.apply {
            setOnCheckedChangeListener { group, checkedId ->
                when (checkedId) {
                    R.id.chipPrice -> updateFilters(sortBy = "price")
                    R.id.chipBedrooms -> updateFilters(sortBy = "bedrooms")
                    R.id.chipNewest -> updateFilters(sortBy = "created_at")
                }
            }
        }
    }

    private fun setupConnectivityMonitoring() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        connectivityManager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                onNetworkAvailable()
            }

            override fun onLost(network: Network) {
                onNetworkLost()
            }
        })
    }

    private fun collectViewModelState() {
        lifecycleScope.launch {
            viewModel.properties.collectLatest { pagingData ->
                propertyAdapter.submitData(pagingData)
            }
        }

        lifecycleScope.launch {
            viewModel.filters.collectLatest { filters ->
                updateFilterUI(filters)
            }
        }
    }

    private fun scheduleBackgroundSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val syncWork = OneTimeWorkRequestBuilder<PropertySyncWorker>()
            .setConstraints(constraints)
            .build()

        workManager.enqueue(syncWork)
    }

    private fun calculateOptimalSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return (screenWidthDp / 300).toInt().coerceAtLeast(1)
    }

    private fun updateFilters(sortBy: String) {
        val currentFilters = viewModel.filters.value
        viewModel.updateFilters(currentFilters.copy(sortBy = sortBy))
    }

    private fun updateFilterUI(filters: PropertySearchFilters) {
        binding.filterChipGroup.apply {
            // Update chip states based on current filters
            filters.propertyType?.let { type ->
                check(when (type) {
                    PropertyType.APARTMENT -> R.id.chipApartment
                    PropertyType.HOUSE -> R.id.chipHouse
                    else -> View.NO_ID
                })
            }
        }
    }

    private fun handleLoadError(error: Throwable) {
        Timber.e(error, "Error loading properties")
        val message = when {
            !NetworkUtils.isNetworkAvailable(this) -> getString(R.string.error_offline_mode)
            else -> getString(R.string.error_loading_properties)
        }
        showError(message)
    }

    private fun showEmptyState() {
        binding.emptyStateLayout.visibility = View.VISIBLE
        binding.recyclerView.visibility = View.GONE
        binding.emptyStateLayout.announceForAccessibility(
            getString(R.string.no_properties_found)
        )
    }

    private fun onNetworkAvailable() {
        if (isOfflineMode) {
            isOfflineMode = false
            viewModel.syncProperties()
            Snackbar.make(
                binding.root,
                getString(R.string.online_mode_resumed),
                Snackbar.LENGTH_SHORT
            ).show()
        }
    }

    private fun onNetworkLost() {
        isOfflineMode = true
        Snackbar.make(
            binding.root,
            getString(R.string.offline_mode_active),
            Snackbar.LENGTH_LONG
        ).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Cleanup resources
        binding.recyclerView.adapter = null
    }
}