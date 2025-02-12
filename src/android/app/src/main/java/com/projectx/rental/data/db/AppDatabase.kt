package com.projectx.rental.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.projectx.rental.data.db.dao.PropertyDao
import com.projectx.rental.data.db.dao.UserDao
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.db.entities.User
import com.projectx.rental.data.db.converters.DateConverter
import com.projectx.rental.data.db.converters.PropertyTypeConverters
import com.projectx.rental.data.db.converters.JsonConverter

/**
 * Main Room database class for the Project X Rental application.
 * Implements comprehensive data persistence with PostgreSQL compatibility,
 * offline support, and robust type conversion.
 *
 * @version Room 2.5.2
 */
@Database(
    entities = [
        User::class,
        Property::class
    ],
    version = DATABASE_VERSION,
    exportSchema = true
)
@TypeConverters(
    DateConverter::class,
    PropertyTypeConverters::class,
    JsonConverter::class
)
abstract class AppDatabase : RoomDatabase() {

    /**
     * Provides access to User data access operations
     */
    abstract fun userDao(): UserDao

    /**
     * Provides access to Property data access operations
     */
    abstract fun propertyDao(): PropertyDao

    companion object {
        private const val DATABASE_NAME = "project_x_rental.db"
        private const val DATABASE_VERSION = 1

        @Volatile
        private var INSTANCE: AppDatabase? = null

        /**
         * Gets the singleton database instance with enhanced configuration
         * for offline support and data integrity.
         *
         * @param context Application context
         * @return Configured AppDatabase instance
         */
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                .apply {
                    // Enable strict mode for development
                    setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                    enableMultiInstanceInvalidation()
                    fallbackToDestructiveMigration()
                    
                    // Add migrations for version updates
                    addMigrations(
                        // Add specific migrations here when needed
                    )

                    // Add callbacks for database events
                    addCallback(object : RoomDatabase.Callback() {
                        // Override callback methods if needed
                    })
                }
                .build()

                INSTANCE = instance
                instance
            }
        }

        /**
         * Clears the database instance.
         * Should be called when database needs to be recreated.
         */
        fun destroyInstance() {
            INSTANCE = null
        }
    }
}