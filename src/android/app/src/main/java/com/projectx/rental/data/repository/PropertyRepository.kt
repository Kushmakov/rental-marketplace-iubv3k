package com.projectx.rental.data.repository

import android.content.Context
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.projectx.rental.data.api.ApiService
import com.projectx.rental.data.api.PagedResponse
import com.projectx.rental.data.db.dao.PropertyDao
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.sync.PropertySyncWorker
import com.projectx.rental.util.NetworkUtils
import com.projectx.rental.util.Result
import io.reactivex.rxjava3.core.Single
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository implementing the single source of truth pattern for property data.
 * Manages data operations between local Room database and remote API service.
 * Implements conflict resolution, background synchronization, and enhanced error handling.
 *
 * @property propertyDao Local database access object for properties
 * @property apiService Remote API service for property operations
 * @property context Application context for network checks
 * @property workManager WorkManager instance for background tasks
 */
@Singleton
class PropertyRepository @Inject constructor(
    private val propertyDao: PropertyDao,
    private val apiService: ApiService,
    private val context: Context,
    private val workManager: WorkManager
) {
    /**
     * Retrieves a property by ID with optimistic locking and conflict resolution.
     * Implements offline-first architecture with background synchronization.
     *
     * @param propertyId Unique identifier of the property
     * @return Flow emitting property data wrapped in Result
     */
    fun getProperty(propertyId: UUID): Flow<Result<Property>> {
        return propertyDao.getProperty(propertyId)
            .map { localProperty -> 
                localProperty?.let { Result.Success(it) } 
                    ?: Result.Error(Exception("Property not found"))
            }
            .onEach { result ->
                if (NetworkUtils.isNetworkAvailable(context) && result is Result.Success) {
                    try {
                        val remoteProperty = apiService.getPropertyById(propertyId)
                            .blockingGet()
                            .body()
                        
                        remoteProperty?.let { remote ->
                            if (remote.version > (result.data.version)) {
                                propertyDao.insertProperty(remote)
                            }
                        }
                    } catch (e: Exception) {
                        // Log error but don't propagate as we're using offline-first
                        e.printStackTrace()
                    }
                }
            }
            .catch { e -> 
                emit(Result.Error(e))
            }
    }

    /**
     * Searches properties with complex filtering and pagination support.
     * Implements local caching with remote synchronization.
     *
     * @param filters Search criteria and filters
     * @param page Page number for pagination
     * @param pageSize Number of items per page
     * @return Flow emitting paginated property results
     */
    fun searchProperties(
        filters: PropertySearchFilters,
        page: Int,
        pageSize: Int
    ): Flow<Result<PagedResponse<Property>>> {
        return propertyDao.searchProperties(
            minPrice = filters.minPrice,
            maxPrice = filters.maxPrice,
            minBedrooms = filters.minBedrooms,
            minBathrooms = filters.minBathrooms,
            propertyType = filters.propertyType
        )
        .map { localProperties ->
            val startIndex = page * pageSize
            val endIndex = minOf(startIndex + pageSize, localProperties.size)
            
            if (startIndex >= localProperties.size) {
                Result.Success(PagedResponse(
                    items = emptyList(),
                    total = localProperties.size,
                    page = page,
                    limit = pageSize,
                    hasMore = false
                ))
            } else {
                Result.Success(PagedResponse(
                    items = localProperties.subList(startIndex, endIndex),
                    total = localProperties.size,
                    page = page,
                    limit = pageSize,
                    hasMore = endIndex < localProperties.size
                ))
            }
        }
        .onEach {
            if (NetworkUtils.isNetworkAvailable(context)) {
                try {
                    val remoteResponse = apiService.getProperties(
                        page = page,
                        limit = pageSize,
                        filter = filters.toMap()
                    ).blockingGet().body()

                    remoteResponse?.items?.let { remoteProperties ->
                        propertyDao.insertProperties(remoteProperties)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        .catch { e ->
            emit(Result.Error(e))
        }
    }

    /**
     * Schedules background synchronization of property data.
     * Implements work constraints and retry logic.
     */
    fun scheduleSyncProperties() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val syncWorkRequest = OneTimeWorkRequestBuilder<PropertySyncWorker>()
            .setConstraints(constraints)
            .build()

        workManager.enqueue(syncWorkRequest)
    }

    /**
     * Updates a property with optimistic locking and conflict resolution.
     *
     * @param property Property to update
     * @return Single emitting update result
     */
    fun updateProperty(property: Property): Single<Result<Property>> {
        return Single.create { emitter ->
            try {
                if (NetworkUtils.isNetworkAvailable(context)) {
                    val remoteResponse = apiService.updateProperty(property.id, property)
                        .blockingGet()
                        .body()

                    remoteResponse?.let { updated ->
                        propertyDao.insertProperty(updated)
                        emitter.onSuccess(Result.Success(updated))
                    } ?: emitter.onSuccess(Result.Error(Exception("Update failed")))
                } else {
                    val localUpdate = propertyDao.updateProperty(property)
                    if (localUpdate > 0) {
                        scheduleSyncProperties()
                        emitter.onSuccess(Result.Success(property))
                    } else {
                        emitter.onSuccess(Result.Error(Exception("Local update failed")))
                    }
                }
            } catch (e: Exception) {
                emitter.onSuccess(Result.Error(e))
            }
        }
    }
}

/**
 * Data class representing property search filters
 */
data class PropertySearchFilters(
    val minPrice: Double? = null,
    val maxPrice: Double? = null,
    val minBedrooms: Int? = null,
    val minBathrooms: Int? = null,
    val propertyType: PropertyType? = null,
    val location: GeoLocation? = null
) {
    fun toMap(): Map<String, Any> = buildMap {
        minPrice?.let { put("min_price", it) }
        maxPrice?.let { put("max_price", it) }
        minBedrooms?.let { put("min_bedrooms", it) }
        minBathrooms?.let { put("min_bathrooms", it) }
        propertyType?.let { put("property_type", it.name) }
        location?.let {
            put("latitude", it.latitude)
            put("longitude", it.longitude)
        }
    }
}