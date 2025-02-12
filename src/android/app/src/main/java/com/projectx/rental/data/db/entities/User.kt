package com.projectx.rental.data.db.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import java.util.Date
import java.util.UUID

/**
 * Room database entity representing a user in the rental application.
 * Provides data mapping between application and database layers with support for
 * Android serialization and API integration.
 *
 * @property id Unique identifier for the user
 * @property email Unique email address used for authentication
 * @property firstName User's first name
 * @property lastName User's last name
 * @property phoneNumber Contact phone number
 * @property profileImageUrl Optional URL to user's profile image
 * @property createdAt Timestamp of user creation
 * @property updatedAt Timestamp of last update
 */
@Entity(
    tableName = "users",
    indices = [Index(value = ["email"], unique = true)]
)
@Parcelize
@TypeConverters(DateConverter::class)
data class User(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: UUID,

    @ColumnInfo(name = "email")
    val email: String,

    @ColumnInfo(name = "first_name")
    val firstName: String,

    @ColumnInfo(name = "last_name")
    val lastName: String,

    @ColumnInfo(name = "phone_number")
    val phoneNumber: String,

    @ColumnInfo(name = "profile_image_url")
    val profileImageUrl: String?,

    @ColumnInfo(name = "created_at")
    val createdAt: Date,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Date
) : Parcelable {

    /**
     * Converts user object to a map for API requests.
     * Handles null values and formats dates according to API requirements.
     *
     * @return Map containing all non-null user properties in API-compatible format
     */
    fun toMap(): Map<String, Any> {
        return buildMap {
            put("id", id.toString())
            put("email", email)
            put("first_name", firstName)
            put("last_name", lastName)
            put("phone_number", phoneNumber)
            profileImageUrl?.let { put("profile_image_url", it) }
            put("created_at", createdAt.toISO8601String())
            put("updated_at", updatedAt.toISO8601String())
        }
    }

    /**
     * Returns user's full name formatted for display.
     *
     * @return Properly formatted full name combining firstName and lastName
     */
    fun getFullName(): String {
        return "${firstName.trim()} ${lastName.trim()}"
    }

    companion object {
        private fun Date.toISO8601String(): String {
            return java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .format(this)
        }
    }
}