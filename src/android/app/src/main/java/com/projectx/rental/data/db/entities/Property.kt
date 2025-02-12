package com.projectx.rental.data.db.entities

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import kotlinx.parcelize.Parcelize
import java.util.Date
import java.util.UUID

/**
 * Room database entity representing a property listing.
 * Implements comprehensive property data model with full database integration.
 * Optimized for mobile performance with proper indexing and type conversion.
 *
 * @property id Unique identifier for the property
 * @property name Name/title of the property
 * @property description Detailed description of the property
 * @property type Type of property (e.g., APARTMENT, HOUSE)
 * @property status Current status of the property listing
 * @property amenities List of available amenities
 * @property images List of property images
 * @property address Physical address of the property
 * @property location Geographical coordinates
 * @property ownerId Reference to property owner
 * @property price Rental price
 * @property bedrooms Number of bedrooms
 * @property bathrooms Number of bathrooms
 * @property squareFootage Total square footage
 * @property isAvailable Current availability status
 * @property createdAt Creation timestamp
 * @property updatedAt Last update timestamp
 * @property version Optimistic locking version
 */
@Entity(
    tableName = "properties",
    indices = [
        Index(value = ["name", "type", "status", "price"]),
        Index(value = ["ownerId"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["id"],
            childColumns = ["ownerId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
@Parcelize
@TypeConverters(PropertyTypeConverters::class)
data class Property(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: UUID = UUID.randomUUID(),

    @ColumnInfo(name = "name")
    val name: String,

    @ColumnInfo(name = "description")
    val description: String,

    @ColumnInfo(name = "type")
    val type: PropertyType,

    @ColumnInfo(name = "status")
    val status: PropertyStatus,

    @ColumnInfo(name = "amenities")
    val amenities: List<String>,

    @ColumnInfo(name = "images")
    val images: List<PropertyImage>,

    @ColumnInfo(name = "address")
    val address: PropertyAddress,

    @ColumnInfo(name = "location")
    val location: GeoLocation,

    @ColumnInfo(name = "owner_id", index = true)
    val ownerId: UUID,

    @ColumnInfo(name = "price")
    val price: Double,

    @ColumnInfo(name = "bedrooms")
    val bedrooms: Int,

    @ColumnInfo(name = "bathrooms")
    val bathrooms: Int,

    @ColumnInfo(name = "square_footage")
    val squareFootage: Double,

    @ColumnInfo(name = "is_available")
    val isAvailable: Boolean = true,

    @ColumnInfo(name = "created_at")
    val createdAt: Date = Date(),

    @ColumnInfo(name = "updated_at")
    val updatedAt: Date = Date(),

    @ColumnInfo(name = "version")
    val version: Int = 1
) : Parcelable {

    /**
     * Secondary constructor with validation
     */
    constructor(
        name: String,
        description: String,
        type: PropertyType,
        status: PropertyStatus,
        amenities: List<String>,
        images: List<PropertyImage>,
        address: PropertyAddress,
        location: GeoLocation,
        ownerId: UUID,
        price: Double,
        bedrooms: Int,
        bathrooms: Int,
        squareFootage: Double
    ) : this(
        id = UUID.randomUUID(),
        name = name.trim().takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException("Property name cannot be blank"),
        description = description.trim(),
        type = type,
        status = status,
        amenities = amenities.map { it.trim() }.filter { it.isNotBlank() },
        images = images,
        address = address,
        location = location,
        ownerId = ownerId,
        price = price.takeIf { it >= 0 }
            ?: throw IllegalArgumentException("Price cannot be negative"),
        bedrooms = bedrooms.takeIf { it >= 0 }
            ?: throw IllegalArgumentException("Bedrooms cannot be negative"),
        bathrooms = bathrooms.takeIf { it >= 0 }
            ?: throw IllegalArgumentException("Bathrooms cannot be negative"),
        squareFootage = squareFootage.takeIf { it > 0 }
            ?: throw IllegalArgumentException("Square footage must be positive"),
        isAvailable = true,
        createdAt = Date(),
        updatedAt = Date(),
        version = 1
    )

    /**
     * Creates a copy of the property with updated timestamp and incremented version
     */
    fun updated(
        name: String = this.name,
        description: String = this.description,
        type: PropertyType = this.type,
        status: PropertyStatus = this.status,
        amenities: List<String> = this.amenities,
        images: List<PropertyImage> = this.images,
        address: PropertyAddress = this.address,
        location: GeoLocation = this.location,
        price: Double = this.price,
        bedrooms: Int = this.bedrooms,
        bathrooms: Int = this.bathrooms,
        squareFootage: Double = this.squareFootage,
        isAvailable: Boolean = this.isAvailable
    ): Property = copy(
        name = name,
        description = description,
        type = type,
        status = status,
        amenities = amenities,
        images = images,
        address = address,
        location = location,
        price = price,
        bedrooms = bedrooms,
        bathrooms = bathrooms,
        squareFootage = squareFootage,
        isAvailable = isAvailable,
        updatedAt = Date(),
        version = version + 1
    )

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Property) return false
        return id == other.id && version == other.version
    }

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + version
        return result
    }
}