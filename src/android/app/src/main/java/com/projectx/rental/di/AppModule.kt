package com.projectx.rental.di

import android.content.Context
import android.content.SharedPreferences
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.room.Room
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.projectx.rental.data.db.AppDatabase
import com.projectx.rental.data.db.dao.UserDao
import com.projectx.rental.data.db.dao.PropertyDao
import com.projectx.rental.data.repository.AuthRepository
import com.projectx.rental.network.ApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import javax.inject.Singleton

/**
 * Dagger Hilt module providing application-wide dependencies with enhanced security.
 * Implements secure database encryption, biometric authentication, and encrypted preferences.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    private const val ENCRYPTED_PREFS_NAME = "com.projectx.rental.encrypted.preferences"
    private const val MASTER_KEY_ALIAS = "com.projectx.rental.masterkey"
    private const val DATABASE_ENCRYPTION_KEY = "com.projectx.rental.dbkey"

    /**
     * Provides encrypted Room database instance with migration support.
     * Implements SQLCipher encryption for secure data storage.
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        // Create database encryption key
        val passphrase = SQLiteDatabase.getBytes(DATABASE_ENCRYPTION_KEY.toCharArray())
        val factory = SupportFactory(passphrase)

        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "project_x_rental.db"
        ).apply {
            // Enable encryption
            openHelperFactory(factory)
            
            // Enable strict mode for data integrity
            setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            enableMultiInstanceInvalidation()
            
            // Add migration support
            fallbackToDestructiveMigration()
            
            // Add database callbacks
            addCallback(object : RoomDatabase.Callback() {
                // Override callback methods if needed
            })
        }.build()
    }

    /**
     * Provides UserDao for secure user data access.
     */
    @Provides
    @Singleton
    fun provideUserDao(database: AppDatabase): UserDao {
        return database.userDao()
    }

    /**
     * Provides PropertyDao for secure property data access.
     */
    @Provides
    @Singleton
    fun providePropertyDao(database: AppDatabase): PropertyDao {
        return database.propertyDao()
    }

    /**
     * Provides encrypted SharedPreferences instance for secure data storage.
     * Uses Android Security Crypto library for encryption.
     */
    @Provides
    @Singleton
    fun provideEncryptedSharedPreferences(
        @ApplicationContext context: Context
    ): SharedPreferences {
        val masterKey = MasterKey.Builder(context, MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            ENCRYPTED_PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * Provides BiometricManager for secure biometric authentication.
     */
    @Provides
    @Singleton
    fun provideBiometricManager(
        @ApplicationContext context: Context
    ): BiometricManager {
        return BiometricManager.from(context)
    }

    /**
     * Provides enhanced AuthRepository with biometric support and secure token storage.
     */
    @Provides
    @Singleton
    fun provideAuthRepository(
        apiService: ApiService,
        userDao: UserDao,
        biometricManager: BiometricManager,
        encryptedPrefs: SharedPreferences
    ): AuthRepository {
        return AuthRepository(
            apiService,
            userDao,
            biometricManager,
            encryptedPrefs
        )
    }

    /**
     * Provides BiometricPrompt.PromptInfo for consistent biometric dialogs.
     */
    @Provides
    @Singleton
    fun provideBiometricPromptInfo(): BiometricPrompt.PromptInfo {
        return BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate")
            .setSubtitle("Confirm biometric to continue")
            .setNegativeButtonText("Cancel")
            .setConfirmationRequired(true)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
    }
}