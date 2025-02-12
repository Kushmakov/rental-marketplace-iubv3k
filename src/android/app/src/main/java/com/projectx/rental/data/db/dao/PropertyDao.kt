package com.projectx.rental.data.db.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.db.entities.PropertyType
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Room Database Data Access Object (DAO) for Property entities.
 * Provides comprehensive CRUD operations with reactive streams support using Kotlin Flow.
 * Implements optimized queries for property search and filtering.
 *
 * @see Property
 * @version Room 2.5.2
 */
@Dao
interface PropertyDao {

    /**
     * Inserts a new property into the database.
     * Uses REPLACE strategy to handle conflicts based on primary key.
     *
     * @param property The property entity to insert
     * @return The row ID of the inserted property
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProperty(property: Property): Long

    /**
     * Inserts multiple properties in a single transaction.
     *
     * @param properties List of properties to insert
     * @return List of inserted row IDs
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProperties(properties: List<Property>): List<Long>

    /**
     * Updates an existing property in the database.
     * Handles optimistic locking using version field.
     *
     * @param property The property to update
     * @return Number of rows updated
     */
    @Update
    suspend fun updateProperty(property: Property): Int

    /**
     * Deletes a property from the database.
     *
     * @param property The property to delete
     * @return Number of rows deleted
     */
    @Delete
    suspend fun deleteProperty(property: Property): Int

    /**
     * Retrieves a property by its ID with reactive updates.
     *
     * @param propertyId The UUID of the property
     * @return Flow emitting the property or null if not found
     */
    @Query("SELECT * FROM properties WHERE id = :propertyId")
    fun getProperty(propertyId: UUID): Flow<Property?>

    /**
     * Retrieves all properties with reactive updates.
     *
     * @return Flow emitting list of all properties
     */
    @Query("SELECT * FROM properties ORDER BY created_at DESC")
    fun getAllProperties(): Flow<List<Property>>

    /**
     * Advanced property search with multiple optional criteria.
     * Supports filtering by price range, rooms, and property type.
     * Results are sorted by price in ascending order.
     *
     * @param minPrice Minimum price filter (optional)
     * @param maxPrice Maximum price filter (optional)
     * @param minBedrooms Minimum number of bedrooms (optional)
     * @param minBathrooms Minimum number of bathrooms (optional)
     * @param propertyType Specific property type filter (optional)
     * @return Flow emitting filtered list of properties
     */
    @Transaction
    @Query("""
        SELECT * FROM properties 
        WHERE (:minPrice IS NULL OR price >= :minPrice)
        AND (:maxPrice IS NULL OR price <= :maxPrice)
        AND (:minBedrooms IS NULL OR bedrooms >= :minBedrooms)
        AND (:minBathrooms IS NULL OR bathrooms >= :minBathrooms)
        AND (:propertyType IS NULL OR type = :propertyType)
        AND is_available = 1
        ORDER BY price ASC
    """)
    fun searchProperties(
        minPrice: Double? = null,
        maxPrice: Double? = null,
        minBedrooms: Int? = null,
        minBathrooms: Int? = null,
        propertyType: PropertyType? = null
    ): Flow<List<Property>>

    /**
     * Retrieves properties by owner ID with reactive updates.
     *
     * @param ownerId The UUID of the owner
     * @return Flow emitting list of properties owned by the specified user
     */
    @Query("SELECT * FROM properties WHERE owner_id = :ownerId ORDER BY created_at DESC")
    fun getPropertiesByOwner(ownerId: UUID): Flow<List<Property>>

    /**
     * Searches properties by location within a radius.
     *
     * @param latitude Center point latitude
     * @param longitude Center point longitude
     * @param radiusKm Search radius in kilometers
     * @return Flow emitting list of properties within the specified radius
     */
    @Query("""
        SELECT * FROM properties 
        WHERE (6371 * acos(cos(radians(:latitude)) * cos(radians(location_lat)) * 
        cos(radians(location_lng) - radians(:longitude)) + 
        sin(radians(:latitude)) * sin(radians(location_lat)))) <= :radiusKm
        ORDER BY created_at DESC
    """)
    fun searchPropertiesByLocation(
        latitude: Double,
        longitude: Double,
        radiusKm: Double
    ): Flow<List<Property>>

    /**
     * Updates the availability status of a property.
     *
     * @param propertyId The UUID of the property
     * @param isAvailable New availability status
     * @return Number of rows updated
     */
    @Query("UPDATE properties SET is_available = :isAvailable WHERE id = :propertyId")
    suspend fun updatePropertyAvailability(propertyId: UUID, isAvailable: Boolean): Int

    /**
     * Retrieves recently added properties with reactive updates.
     *
     * @param limit Maximum number of properties to return
     * @return Flow emitting list of recent properties
     */
    @Query("SELECT * FROM properties WHERE is_available = 1 ORDER BY created_at DESC LIMIT :limit")
    fun getRecentProperties(limit: Int): Flow<List<Property>>

    /**
     * Retrieves properties within a specific price range with reactive updates.
     *
     * @param minPrice Minimum price
     * @param maxPrice Maximum price
     * @return Flow emitting list of properties within price range
     */
    @Query("""
        SELECT * FROM properties 
        WHERE price BETWEEN :minPrice AND :maxPrice 
        AND is_available = 1 
        ORDER BY price ASC
    """)
    fun getPropertiesInPriceRange(minPrice: Double, maxPrice: Double): Flow<List<Property>>
}