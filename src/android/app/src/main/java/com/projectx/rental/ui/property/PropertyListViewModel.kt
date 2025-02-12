package com.projectx.rental.ui.property

import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.repository.PropertyRepository
import com.projectx.rental.data.repository.PropertySearchFilters
import com.projectx.rental.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * ViewModel managing property listing data and user interactions.
 * Implements pagination, background sync, advanced filtering, and offline support.
 *
 * @property propertyRepository Repository for property data operations
 * @property workManager WorkManager for background tasks
 */
@HiltViewModel
class PropertyListViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val workManager: WorkManager
) : BaseViewModel() {

    companion object {
        private const val PAGE_SIZE = 20
        private const val PREFETCH_DISTANCE = 3
        private const val SYNC_INTERVAL_HOURS = 4L
        private const val INITIAL_LOAD_SIZE = 40
    }

    // Paging configuration
    private val pagingConfig = PagingConfig(
        pageSize = PAGE_SIZE,
        prefetchDistance = PREFETCH_DISTANCE,
        initialLoadSize = INITIAL_LOAD_SIZE,
        enablePlaceholders = true
    )

    // Property data stream
    private val _properties = MutableStateFlow<PagingData<Property>>(PagingData.empty())
    val properties: StateFlow<PagingData<Property>> = _properties

    // Filter state
    private val _filters = MutableStateFlow(PropertySearchFilters())
    val filters: StateFlow<PropertySearchFilters> = _filters

    // Data version tracking
    private val _dataVersion = MutableStateFlow(0)
    
    // Background refresh job
    private var refreshJob: Job? = null

    init {
        setupBackgroundSync()
        loadInitialData()
    }

    /**
     * Loads paginated property data with current filters.
     * Implements caching and error handling.
     */
    fun loadPropertiesPaged(): Flow<PagingData<Property>> {
        return Pager(
            config = pagingConfig,
            pagingSourceFactory = {
                propertyRepository.searchProperties(
                    filters = filters.value,
                    page = 0,
                    pageSize = PAGE_SIZE
                ).map { result ->
                    result.getOrNull()?.items ?: emptyList()
                }
            }
        ).flow
            .cachedIn(viewModelScope)
            .catch { error ->
                Timber.e(error, "Error loading properties")
                showError("Failed to load properties", error)
            }
    }

    /**
     * Updates property filters with optimized processing.
     *
     * @param newFilters Updated filter criteria
     */
    fun updateFilters(newFilters: PropertySearchFilters) {
        viewModelScope.launch {
            try {
                _filters.value = newFilters
                refreshProperties()
            } catch (e: Exception) {
                Timber.e(e, "Error updating filters")
                showError("Failed to update filters", e)
            }
        }
    }

    /**
     * Initiates background property refresh with versioning.
     */
    fun refreshPropertiesBackground() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val refreshWork = OneTimeWorkRequestBuilder<PropertySyncWorker>()
            .setConstraints(constraints)
            .setInitialDelay(SYNC_INTERVAL_HOURS, TimeUnit.HOURS)
            .build()

        workManager.enqueue(refreshWork)
    }

    /**
     * Refreshes property data with current filters.
     */
    private fun refreshProperties() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            try {
                showLoading()
                val newData = loadPropertiesPaged()
                newData.collect { pagingData ->
                    _properties.value = pagingData
                    _dataVersion.value++
                }
            } catch (e: Exception) {
                Timber.e(e, "Error refreshing properties")
                showError("Failed to refresh properties", e)
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Sets up periodic background synchronization.
     */
    private fun setupBackgroundSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val syncWork = OneTimeWorkRequestBuilder<PropertySyncWorker>()
            .setConstraints(constraints)
            .setInitialDelay(SYNC_INTERVAL_HOURS, TimeUnit.HOURS)
            .build()

        workManager.enqueue(syncWork)
    }

    /**
     * Loads initial property data on ViewModel creation.
     */
    private fun loadInitialData() {
        viewModelScope.launch {
            try {
                showLoading()
                val initialData = loadPropertiesPaged()
                initialData.collect { pagingData ->
                    _properties.value = pagingData
                }
            } catch (e: Exception) {
                Timber.e(e, "Error loading initial data")
                showError("Failed to load initial data", e)
            } finally {
                hideLoading()
            }
        }
    }

    override fun onCleared() {
        refreshJob?.cancel()
        super.onCleared()
    }
}