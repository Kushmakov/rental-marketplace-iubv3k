package com.projectx.rental.data.db.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.projectx.rental.data.db.entities.User
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Data Access Object (DAO) interface for User entity providing CRUD operations
 * and custom queries with reactive Flow support and transaction safety.
 *
 * Uses Room persistence library version 2.5.2 for database operations
 * and Kotlin Flow 1.7.3 for reactive streams.
 */
@Dao
interface UserDao {

    /**
     * Retrieves a user by their unique identifier with reactive updates.
     *
     * @param id The UUID of the user to retrieve
     * @return Flow emitting the matching User or null if not found
     */
    @Query("SELECT * FROM users WHERE id = :id")
    fun getUserById(id: UUID): Flow<User?>

    /**
     * Retrieves a user by their email address with case-insensitive matching.
     * Uses indexed email field for efficient lookups.
     *
     * @param email The email address to search for
     * @return Flow emitting the matching User or null if not found
     */
    @Query("SELECT * FROM users WHERE LOWER(email) = LOWER(:email)")
    fun getUserByEmail(email: String): Flow<User?>

    /**
     * Retrieves all users from the database ordered by email address.
     *
     * @return Flow emitting a list of all users
     */
    @Query("SELECT * FROM users ORDER BY email ASC")
    fun getAllUsers(): Flow<List<User>>

    /**
     * Inserts a new user into the database with conflict resolution.
     * Uses REPLACE strategy to handle existing user conflicts.
     *
     * @param user The User object to insert
     * @return The row ID of the inserted user or -1 if insert failed
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    @Transaction
    suspend fun insertUser(user: User): Long

    /**
     * Updates an existing user in the database.
     * Uses optimistic locking with updatedAt timestamp.
     *
     * @param user The User object to update
     * @return The number of users updated (0 or 1)
     */
    @Update
    @Transaction
    suspend fun updateUser(user: User): Int

    /**
     * Deletes a user from the database.
     * Performs cascading deletion of related data.
     *
     * @param user The User object to delete
     * @return The number of users deleted (0 or 1)
     */
    @Delete
    @Transaction
    suspend fun deleteUser(user: User): Int

    /**
     * Deletes a user by their unique identifier.
     * Performs cascading deletion of related data.
     *
     * @param id The UUID of the user to delete
     * @return The number of users deleted (0 or 1)
     */
    @Query("DELETE FROM users WHERE id = :id")
    @Transaction
    suspend fun deleteUserById(id: UUID): Int

    /**
     * Deletes all users from the database.
     * Performs cascading deletion of all related data.
     */
    @Query("DELETE FROM users")
    @Transaction
    suspend fun clearAllUsers()

    /**
     * Retrieves users created after a specific date.
     * Useful for synchronization and filtering.
     *
     * @param timestamp The cutoff timestamp for user creation
     * @return Flow emitting a list of matching users
     */
    @Query("SELECT * FROM users WHERE created_at > :timestamp ORDER BY created_at DESC")
    fun getUsersCreatedAfter(timestamp: Long): Flow<List<User>>

    /**
     * Retrieves users updated after a specific date.
     * Useful for synchronization and change tracking.
     *
     * @param timestamp The cutoff timestamp for user updates
     * @return Flow emitting a list of matching users
     */
    @Query("SELECT * FROM users WHERE updated_at > :timestamp ORDER BY updated_at DESC")
    fun getUsersUpdatedAfter(timestamp: Long): Flow<List<User>>

    /**
     * Counts the total number of users in the database.
     * Useful for analytics and pagination.
     *
     * @return Flow emitting the current user count
     */
    @Query("SELECT COUNT(*) FROM users")
    fun getUserCount(): Flow<Int>
}