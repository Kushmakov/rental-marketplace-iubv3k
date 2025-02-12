package com.projectx.rental

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.projectx.rental.data.db.AppDatabase
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.hamcrest.CoreMatchers.instanceOf
import org.hamcrest.CoreMatchers.notNullValue
import org.hamcrest.MatcherAssert.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Comprehensive instrumented test class for validating Android-specific functionality,
 * database operations, and application initialization.
 *
 * @version 1.0.0
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {

    @get:Rule
    var hiltRule = HiltAndroidRule(this)

    private lateinit var context: Context
    private lateinit var appDatabase: AppDatabase

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        hiltRule.inject()
    }

    /**
     * Validates application context initialization and configuration.
     * Verifies package name, application instance type, and dependency injection setup.
     */
    @Test
    fun useAppContext() {
        // Get instrumentation context
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext

        // Verify package name
        assertThat(
            "Package name verification failed",
            appContext.packageName,
            org.hamcrest.CoreMatchers.`is`("com.projectx.rental")
        )

        // Verify application instance
        val application = appContext.applicationContext
        assertThat(
            "Application instance verification failed",
            application,
            instanceOf(ProjectXApplication::class.java)
        )

        // Verify application initialization
        val projectXApp = application as ProjectXApplication
        assertThat(
            "Application initialization failed",
            projectXApp,
            notNullValue()
        )

        // Verify dependency injection
        val latch = CountDownLatch(1)
        try {
            // Wait for DI to complete
            val success = latch.await(5, TimeUnit.SECONDS)
            assertThat(
                "Dependency injection timeout",
                success,
                org.hamcrest.CoreMatchers.`is`(true)
            )
        } finally {
            latch.countDown()
        }
    }

    /**
     * Comprehensive verification of database initialization and functionality.
     * Tests database creation, version management, and configuration settings.
     */
    @Test
    fun testDatabaseInitialization() {
        // Initialize database
        appDatabase = AppDatabase.getDatabase(context)

        // Verify database instance
        assertThat(
            "Database initialization failed",
            appDatabase,
            notNullValue()
        )

        // Verify database version
        assertThat(
            "Database version mismatch",
            appDatabase.openHelper.readableDatabase.version,
            org.hamcrest.CoreMatchers.`is`(1)
        )

        // Verify UserDao initialization
        val userDao = appDatabase.userDao()
        assertThat(
            "UserDao initialization failed",
            userDao,
            notNullValue()
        )

        // Verify PropertyDao initialization
        val propertyDao = appDatabase.propertyDao()
        assertThat(
            "PropertyDao initialization failed",
            propertyDao,
            notNullValue()
        )

        // Verify database configuration
        val dbFile = context.getDatabasePath("project_x_rental.db")
        assertThat(
            "Database file creation failed",
            dbFile.exists(),
            org.hamcrest.CoreMatchers.`is`(true)
        )

        // Verify database is writable
        val db = appDatabase.openHelper.writableDatabase
        assertThat(
            "Database is not writable",
            db.isOpen,
            org.hamcrest.CoreMatchers.`is`(true)
        )

        // Verify WAL mode is enabled
        val walMode = db.query("PRAGMA journal_mode;").use { 
            it.moveToFirst()
            it.getString(0)
        }
        assertThat(
            "WAL mode not enabled",
            walMode.uppercase(),
            org.hamcrest.CoreMatchers.`is`("WAL")
        )

        // Verify foreign key support
        val foreignKeysEnabled = db.query("PRAGMA foreign_keys;").use {
            it.moveToFirst()
            it.getInt(0) == 1
        }
        assertThat(
            "Foreign keys not enabled",
            foreignKeysEnabled,
            org.hamcrest.CoreMatchers.`is`(true)
        )
    }
}