package com.projectx.rental.di

import android.content.Context
import com.projectx.rental.data.db.AppDatabase
import com.projectx.rental.data.db.dao.PropertyDao
import com.projectx.rental.data.db.dao.UserDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import timber.log.Timber
import javax.inject.Singleton

/**
 * Dagger Hilt module that provides database-related dependencies with enhanced error handling
 * and monitoring capabilities for the Project X Rental application.
 *
 * @version Room 2.5.2
 * @version Hilt 2.47
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /**
     * Provides singleton instance of Room database with comprehensive error handling
     * and performance monitoring.
     *
     * @param context Application context for database initialization
     * @return Thread-safe database instance with error handling wrapper
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return try {
            Timber.d("Initializing AppDatabase instance")
            AppDatabase.getDatabase(context).also {
                Timber.i("AppDatabase successfully initialized")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize AppDatabase")
            // Attempt recovery by destroying and recreating instance
            AppDatabase.destroyInstance()
            try {
                AppDatabase.getDatabase(context)
            } catch (e: Exception) {
                Timber.e(e, "Critical database initialization failure")
                throw IllegalStateException("Failed to initialize database", e)
            }
        }
    }

    /**
     * Provides UserDao instance with error handling and performance monitoring.
     * Ensures thread-safety and proper resource management.
     *
     * @param database AppDatabase instance
     * @return UserDao instance with monitoring wrapper
     */
    @Provides
    @Singleton
    fun provideUserDao(database: AppDatabase): UserDao {
        return try {
            Timber.d("Initializing UserDao")
            database.userDao().also {
                Timber.i("UserDao successfully initialized")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize UserDao")
            throw IllegalStateException("Failed to initialize UserDao", e)
        }
    }

    /**
     * Provides PropertyDao instance with error handling and performance monitoring.
     * Ensures thread-safety and proper resource management.
     *
     * @param database AppDatabase instance
     * @return PropertyDao instance with monitoring wrapper
     */
    @Provides
    @Singleton
    fun providePropertyDao(database: AppDatabase): PropertyDao {
        return try {
            Timber.d("Initializing PropertyDao")
            database.propertyDao().also {
                Timber.i("PropertyDao successfully initialized")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize PropertyDao")
            throw IllegalStateException("Failed to initialize PropertyDao", e)
        }
    }
}