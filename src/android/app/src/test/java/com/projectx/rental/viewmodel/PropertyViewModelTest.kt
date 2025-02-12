package com.projectx.rental.viewmodel

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import com.projectx.rental.data.api.PagedResponse
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.repository.PropertyRepository
import com.projectx.rental.data.repository.PropertySearchFilters
import com.projectx.rental.ui.property.PropertyDetailViewModel
import com.projectx.rental.ui.property.PropertyListViewModel
import com.projectx.rental.util.NetworkUtils
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.util.*
import androidx.lifecycle.SavedStateHandle
import com.projectx.rental.util.Result
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.junit.jupiter.api.AfterEach
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
@ExtendWith(InstantTaskExecutorRule::class)
class PropertyViewModelTest {

    // Test dependencies
    private lateinit var propertyRepository: PropertyRepository
    private lateinit var workManager: WorkManager
    private lateinit var networkUtils: NetworkUtils
    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var testDispatcher: TestCoroutineDispatcher
    
    // View models under test
    private lateinit var propertyDetailViewModel: PropertyDetailViewModel
    private lateinit var propertyListViewModel: PropertyListViewModel

    @BeforeEach
    fun setup() {
        testDispatcher = TestCoroutineDispatcher()
        
        // Initialize mocks
        propertyRepository = mockk(relaxed = true)
        workManager = mockk(relaxed = true)
        networkUtils = mockk(relaxed = true)
        savedStateHandle = SavedStateHandle()

        // Initialize view models
        propertyDetailViewModel = PropertyDetailViewModel(
            propertyRepository = propertyRepository,
            savedStateHandle = savedStateHandle,
            workManager = workManager
        )

        propertyListViewModel = PropertyListViewModel(
            propertyRepository = propertyRepository,
            workManager = workManager
        )
    }

    @AfterEach
    fun cleanup() {
        testDispatcher.cleanupTestCoroutines()
        clearAllMocks()
    }

    @Test
    fun `test property detail loading success`() = runTest {
        // Given
        val propertyId = UUID.randomUUID()
        val testProperty = createTestProperty(propertyId)
        coEvery { propertyRepository.getProperty(propertyId) } returns flowOf(Result.Success(testProperty))

        // When
        propertyDetailViewModel.loadProperty(propertyId)

        // Then
        verify(exactly = 1) { propertyRepository.getProperty(propertyId) }
        assertThat(propertyDetailViewModel.property.value).isEqualTo(testProperty)
        assertThat(propertyDetailViewModel.loading.value).isFalse()
    }

    @Test
    fun `test property detail loading error`() = runTest {
        // Given
        val propertyId = UUID.randomUUID()
        val error = Exception("Network error")
        coEvery { propertyRepository.getProperty(propertyId) } returns flowOf(Result.Error(error))

        // When
        propertyDetailViewModel.loadProperty(propertyId)

        // Then
        verify(exactly = 1) { propertyRepository.getProperty(propertyId) }
        assertThat(propertyDetailViewModel.error.value).contains("Failed to load property details")
        assertThat(propertyDetailViewModel.loading.value).isFalse()
    }

    @Test
    fun `test property list pagination`() = runTest {
        // Given
        val pageSize = 20
        val testProperties = createTestPropertyList(30)
        val pagedResponse = PagedResponse(
            items = testProperties.take(pageSize),
            total = testProperties.size,
            page = 0,
            limit = pageSize,
            hasMore = true
        )
        
        coEvery { 
            propertyRepository.searchProperties(any(), 0, pageSize)
        } returns flowOf(Result.Success(pagedResponse))

        // When
        val job = launch {
            propertyListViewModel.loadPropertiesPaged().collect { pagingData ->
                // Then
                assertThat(pagingData).isNotNull()
            }
        }
        
        job.cancel()
    }

    @Test
    fun `test property filter application`() = runTest {
        // Given
        val filters = PropertySearchFilters(
            minPrice = 1000.0,
            maxPrice = 2000.0,
            minBedrooms = 2,
            minBathrooms = 1
        )

        // When
        propertyListViewModel.updateFilters(filters)

        // Then
        assertThat(propertyListViewModel.filters.value).isEqualTo(filters)
        coVerify { propertyRepository.searchProperties(filters, any(), any()) }
    }

    @Test
    fun `test offline support and data caching`() = runTest {
        // Given
        val propertyId = UUID.randomUUID()
        val cachedProperty = createTestProperty(propertyId)
        every { networkUtils.isNetworkAvailable(any()) } returns false
        coEvery { propertyRepository.getProperty(propertyId) } returns flowOf(Result.Success(cachedProperty))

        // When
        propertyDetailViewModel.loadProperty(propertyId)

        // Then
        verify(exactly = 1) { propertyRepository.getProperty(propertyId) }
        assertThat(propertyDetailViewModel.property.value).isEqualTo(cachedProperty)
    }

    @Test
    fun `test favorite toggle with optimistic update`() = runTest {
        // Given
        val propertyId = UUID.randomUUID()
        val property = createTestProperty(propertyId)
        coEvery { propertyRepository.getProperty(propertyId) } returns flowOf(Result.Success(property))
        coEvery { propertyRepository.updateProperty(any()) } returns io.reactivex.rxjava3.core.Single.just(Result.Success(property))

        // When
        propertyDetailViewModel.loadProperty(propertyId)
        propertyDetailViewModel.toggleFavorite()

        // Then
        coVerify { propertyRepository.updateProperty(any()) }
    }

    private fun createTestProperty(id: UUID = UUID.randomUUID()) = Property(
        id = id,
        name = "Test Property",
        description = "Test Description",
        type = PropertyType.APARTMENT,
        status = PropertyStatus.AVAILABLE,
        amenities = listOf("WiFi", "Parking"),
        images = emptyList(),
        address = PropertyAddress("123 Test St", "Test City", "Test State", "12345"),
        location = GeoLocation(0.0, 0.0),
        ownerId = UUID.randomUUID(),
        price = 1500.0,
        bedrooms = 2,
        bathrooms = 1,
        squareFootage = 1000.0
    )

    private fun createTestPropertyList(count: Int): List<Property> {
        return (1..count).map { createTestProperty() }
    }
}