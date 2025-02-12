package com.projectx.rental.ui.property

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.repository.PropertyRepository
import com.projectx.rental.ui.common.BaseViewModel
import com.projectx.rental.util.NetworkUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * ViewModel managing property detail screen state and user interactions.
 * Implements offline-first architecture with background synchronization.
 *
 * @property propertyRepository Repository for property data operations
 * @property savedStateHandle Handle for preserving UI state
 * @property workManager WorkManager for scheduling background tasks
 */
@HiltViewModel
class PropertyDetailViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val savedStateHandle: SavedStateHandle,
    private val workManager: WorkManager
) : BaseViewModel() {

    companion object {
        private const val KEY_PROPERTY_ID = "property_id"
        private const val KEY_IS_FAVORITE = "is_favorite"
        private const val PROPERTY_SYNC_DELAY = 15_000L // 15 seconds
    }

    // Property details with backing field
    private val _property = MutableLiveData<Property?>()
    val property: LiveData<Property?> = _property

    // Property images with backing field
    private val _images = MutableLiveData<List<PropertyImage>>()
    val images: LiveData<List<PropertyImage>> = _images

    // Favorite status with backing field
    private val _isFavorite = MutableLiveData<Boolean>()
    val isFavorite: LiveData<Boolean> = _isFavorite

    // Amenities with backing field
    private val _amenities = MutableLiveData<List<Amenity>>()
    val amenities: LiveData<List<Amenity>> = _amenities

    // Availability status with backing field
    private val _availability = MutableLiveData<PropertyAvailability>()
    val availability: LiveData<PropertyAvailability> = _availability

    // Network state with backing field
    private val _networkState = MutableLiveData<NetworkState>()
    val networkState: LiveData<NetworkState> = _networkState

    init {
        // Restore saved state
        savedStateHandle.get<UUID>(KEY_PROPERTY_ID)?.let { propertyId ->
            loadProperty(propertyId)
        }
        savedStateHandle.get<Boolean>(KEY_IS_FAVORITE)?.let { favorite ->
            _isFavorite.value = favorite
        }
    }

    /**
     * Loads property details with offline-first approach.
     * Implements caching and background synchronization.
     *
     * @param propertyId Unique identifier of the property
     */
    fun loadProperty(propertyId: UUID) {
        viewModelScope.launch {
            try {
                showLoading()
                
                // Save property ID to handle process death
                savedStateHandle[KEY_PROPERTY_ID] = propertyId

                // Collect property data flow
                propertyRepository.getProperty(propertyId).collect { result ->
                    when (result) {
                        is Result.Success -> {
                            result.data.let { property ->
                                _property.value = property
                                _images.value = property.images
                                _amenities.value = property.amenities
                                _availability.value = property.availability
                                _isFavorite.value = property.isFavorite
                                savedStateHandle[KEY_IS_FAVORITE] = property.isFavorite
                            }
                        }
                        is Result.Error -> {
                            showError("Failed to load property details", result.exception)
                        }
                    }
                }
            } catch (e: Exception) {
                showError("Error loading property", e)
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Forces refresh of property details from remote source.
     * Implements retry mechanism and error handling.
     */
    fun refreshProperty() {
        viewModelScope.launch {
            try {
                showLoading()
                
                savedStateHandle.get<UUID>(KEY_PROPERTY_ID)?.let { propertyId ->
                    if (NetworkUtils.isNetworkAvailable(context)) {
                        propertyRepository.refreshProperties()
                        loadProperty(propertyId)
                    } else {
                        _networkState.value = NetworkState.OFFLINE
                        propertyRepository.scheduleSyncProperties()
                    }
                }
            } catch (e: Exception) {
                showError("Failed to refresh property", e)
                _networkState.value = NetworkState.ERROR
            } finally {
                hideLoading()
            }
        }
    }

    /**
     * Toggles property favorite status with offline support.
     * Implements optimistic updates and background synchronization.
     */
    fun toggleFavorite() {
        viewModelScope.launch {
            try {
                val currentProperty = _property.value ?: return@launch
                val newFavoriteStatus = !(_isFavorite.value ?: false)
                
                // Optimistic update
                _isFavorite.value = newFavoriteStatus
                savedStateHandle[KEY_IS_FAVORITE] = newFavoriteStatus

                // Update property with new favorite status
                val updatedProperty = currentProperty.copy(
                    isFavorite = newFavoriteStatus,
                    updatedAt = java.util.Date()
                )

                propertyRepository.updateProperty(updatedProperty)
                    .subscribe(
                        { result ->
                            when (result) {
                                is Result.Success -> {
                                    // Update successful
                                }
                                is Result.Error -> {
                                    // Revert optimistic update
                                    _isFavorite.value = !newFavoriteStatus
                                    savedStateHandle[KEY_IS_FAVORITE] = !newFavoriteStatus
                                    showError("Failed to update favorite status", result.exception)
                                }
                            }
                        },
                        { error ->
                            // Revert optimistic update
                            _isFavorite.value = !newFavoriteStatus
                            savedStateHandle[KEY_IS_FAVORITE] = !newFavoriteStatus
                            showError("Error updating favorite status", error)
                        }
                    )
            } catch (e: Exception) {
                showError("Error toggling favorite", e)
            }
        }
    }

    /**
     * Cleans up resources and saves state when ViewModel is destroyed.
     */
    override fun onCleared() {
        viewModelScope.launch {
            try {
                // Save current state
                _property.value?.let { property ->
                    savedStateHandle[KEY_PROPERTY_ID] = property.id
                }
                _isFavorite.value?.let { favorite ->
                    savedStateHandle[KEY_IS_FAVORITE] = favorite
                }
            } finally {
                super.onCleared()
            }
        }
    }
}

/**
 * Sealed class representing network state
 */
sealed class NetworkState {
    object CONNECTED : NetworkState()
    object OFFLINE : NetworkState()
    object ERROR : NetworkState()
}