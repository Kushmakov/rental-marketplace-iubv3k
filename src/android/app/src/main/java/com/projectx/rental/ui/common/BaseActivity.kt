package com.projectx.rental.ui.common

import android.os.Bundle
import android.view.View
import android.view.accessibility.AccessibilityEvent
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.progressindicator.MaterialProgressIndicator
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.projectx.rental.ui.common.BaseViewModel
import com.projectx.rental.util.NetworkUtils
import io.reactivex.rxjava3.disposables.CompositeDisposable
import timber.log.Timber
import java.lang.ref.WeakReference

/**
 * Abstract base activity class providing common functionality for all activities in the rental application.
 * Implements Material Design 3.0 components, accessibility support, and enhanced lifecycle management.
 *
 * @version 1.0
 */
abstract class BaseActivity : AppCompatActivity() {

    // Weak reference to prevent memory leaks
    private var loadingIndicator: WeakReference<MaterialProgressIndicator>? = null
    
    // Abstract ViewModel property to be implemented by child classes
    protected abstract val viewModel: BaseViewModel
    
    // Disposable container for managing RxJava subscriptions
    protected val disposables = CompositeDisposable()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize Material Design components with accessibility support
        initializeMaterialComponents()
        
        // Set up ViewModel observers
        setupViewModelObservers()
        
        // Initialize network monitoring
        initializeNetworkMonitoring()
    }

    /**
     * Initializes Material Design components with proper accessibility configurations
     */
    private fun initializeMaterialComponents() {
        // Create loading indicator with Material Design specifications
        MaterialProgressIndicator(this).apply {
            isIndeterminate = true
            trackCornerRadius = 4
            indicatorSize = MaterialProgressIndicator.SIZE_LARGE
            visibility = View.GONE
            contentDescription = "Loading content"
            
            // Store weak reference
            loadingIndicator = WeakReference(this)
        }
    }

    /**
     * Sets up observers for ViewModel state changes
     */
    private fun setupViewModelObservers() {
        viewModel.loading.observe(this) { isLoading ->
            if (isLoading) showLoading() else hideLoading()
        }

        viewModel.error.observe(this) { error ->
            error?.let { showError(ErrorType.GENERAL, it) }
        }

        viewModel.networkAvailable.observe(this) { isAvailable ->
            handleNetworkChange(isAvailable)
        }
    }

    /**
     * Initializes network monitoring with caching support
     */
    private fun initializeNetworkMonitoring() {
        try {
            viewModel.checkNetworkAvailability(applicationContext)
        } catch (e: SecurityException) {
            Timber.e(e, "Network permission denied")
            showError(ErrorType.PERMISSION, "Network permission required")
        }
    }

    /**
     * Shows loading indicator with accessibility announcement
     */
    protected fun showLoading() {
        loadingIndicator?.get()?.apply {
            visibility = View.VISIBLE
            announceForAccessibility("Loading content")
        }
    }

    /**
     * Hides loading indicator with accessibility announcement
     */
    protected fun hideLoading() {
        loadingIndicator?.get()?.apply {
            visibility = View.GONE
            announceForAccessibility("Loading complete")
        }
    }

    /**
     * Enum class defining different types of errors
     */
    enum class ErrorType {
        NETWORK,
        PERMISSION,
        GENERAL
    }

    /**
     * Shows error message with appropriate styling and accessibility support
     *
     * @param errorType Type of error to display
     * @param message Error message to show
     */
    protected fun showError(errorType: ErrorType, message: String) {
        // Log error with appropriate context
        Timber.e("Error occurred: Type=$errorType, Message=$message")

        when (errorType) {
            ErrorType.NETWORK -> showNetworkError(message)
            ErrorType.PERMISSION -> showPermissionError(message)
            ErrorType.GENERAL -> showGeneralError(message)
        }
    }

    /**
     * Shows network-specific error with retry option
     */
    private fun showNetworkError(message: String) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Network Error")
            .setMessage(message)
            .setPositiveButton("Retry") { _, _ ->
                viewModel.checkNetworkAvailability(applicationContext)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    /**
     * Shows permission-related error with settings option
     */
    private fun showPermissionError(message: String) {
        Snackbar.make(
            findViewById(android.R.id.content),
            message,
            Snackbar.LENGTH_LONG
        ).setAction("Settings") {
            // Open app settings
            startActivity(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        }.show()
    }

    /**
     * Shows general error message
     */
    private fun showGeneralError(message: String) {
        Snackbar.make(
            findViewById(android.R.id.content),
            message,
            Snackbar.LENGTH_LONG
        ).show()
    }

    /**
     * Handles network connectivity changes
     *
     * @param isAvailable Whether network is available
     */
    protected fun handleNetworkChange(isAvailable: Boolean) {
        if (!isAvailable) {
            showError(ErrorType.NETWORK, "Network connection lost")
        }
    }

    override fun onDestroy() {
        // Clear disposables
        if (!disposables.isDisposed) {
            disposables.clear()
            disposables.dispose()
        }

        // Clear loading indicator reference
        loadingIndicator?.clear()
        loadingIndicator = null

        super.onDestroy()
    }
}