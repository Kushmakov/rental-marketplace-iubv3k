package com.projectx.rental

import android.app.Application
import android.os.StrictMode
import com.crashlytics.android.CrashReporter
import com.projectx.rental.di.AppModule
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

/**
 * Custom Application class that serves as the entry point for the Project X Rental application.
 * Initializes core dependencies, security configurations, and monitoring systems.
 *
 * @version 1.0.0
 */
@HiltAndroidApp
class ProjectXApplication : Application() {

    @Inject
    lateinit var crashReporter: CrashReporter

    override fun onCreate() {
        super.onCreate()
        
        // Initialize logging based on build type
        initializeLogging()

        // Configure strict mode for development builds
        if (BuildConfig.DEBUG) {
            configureStrictMode()
        }

        // Initialize crash reporting
        crashReporter.apply {
            setCrashlyticsCollectionEnabled(true)
            setCustomKey("app_version", BuildConfig.VERSION_NAME)
            setCustomKey("build_type", BuildConfig.BUILD_TYPE)
        }

        Timber.i("ProjectX Rental Application initialized successfully")
    }

    /**
     * Initializes logging configuration based on build type.
     * Uses Timber for debug builds and CrashReporter for release builds.
     */
    private fun initializeLogging() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            // Custom production tree that logs to Crashlytics
            Timber.plant(object : Timber.Tree() {
                override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
                    if (priority >= android.util.Log.INFO) {
                        t?.let { crashReporter.recordException(it) }
                        crashReporter.log("$tag: $message")
                    }
                }
            })
        }
    }

    /**
     * Configures StrictMode policies for development builds.
     * Helps detect potential performance and security issues early.
     */
    private fun configureStrictMode() {
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectDiskReads()
                .detectDiskWrites()
                .detectNetwork()
                .detectCustomSlowCalls()
                .penaltyLog()
                .build()
        )

        StrictMode.setVmPolicy(
            StrictMode.VmPolicy.Builder()
                .detectLeakedSqlLiteObjects()
                .detectLeakedClosableObjects()
                .detectActivityLeaks()
                .detectFileUriExposure()
                .detectLeakedRegistrationObjects()
                .penaltyLog()
                .build()
        )
    }

    companion object {
        private const val TAG = "ProjectXApplication"
    }
}