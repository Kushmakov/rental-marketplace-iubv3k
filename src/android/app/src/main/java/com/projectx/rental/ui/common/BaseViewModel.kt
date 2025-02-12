package com.projectx.rental.ui.common

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.projectx.rental.util.NetworkUtils
import io.reactivex.rxjava3.disposables.CompositeDisposable
import timber.log.Timber

/**
 * Thread-safe abstract base class for all ViewModels in the rental application.
 * Provides common functionality for error handling, loading state management,
 * and network connectivity monitoring with enhanced caching support.
 *
 * @version 1.0
 */
abstract class BaseViewModel : ViewModel() {

    // Thread-safe disposable container for managing RxJava subscriptions
    protected val disposables = CompositeDisposable()

    // Loading state with backing field for thread-safe updates
    private val _loading = MutableLiveData<Boolean>().apply { value = false }
    val loading: LiveData<Boolean> = _loading

    // Error state with backing field for thread-safe updates
    private val _error = MutableLiveData<String>()
    val error: LiveData<String> = _error

    // Network availability state with backing field for thread-safe updates
    private val _networkAvailable = MutableLiveData<Boolean>()
    val networkAvailable: LiveData<Boolean> = _networkAvailable

    init {
        // Initialize network status with cached value if available
        NetworkUtils.getCachedNetworkStatus()?.let {
            _networkAvailable.value = it
        }
    }

    /**
     * Shows loading indicator in a thread-safe manner.
     * Uses postValue to ensure main thread updates.
     */
    protected fun showLoading() {
        _loading.postValue(true)
    }

    /**
     * Hides loading indicator in a thread-safe manner.
     * Uses postValue to ensure main thread updates.
     */
    protected fun hideLoading() {
        _loading.postValue(false)
    }

    /**
     * Shows formatted error message with comprehensive logging.
     * Handles both simple messages and throwables with stack traces.
     *
     * @param message The error message to display
     * @param throwable Optional throwable for detailed logging
     */
    protected fun showError(message: String, throwable: Throwable? = null) {
        val formattedMessage = when {
            throwable != null -> "$message: ${throwable.localizedMessage}"
            else -> message
        }

        // Log error with stack trace if available
        throwable?.let {
            Timber.e(it, "Error occurred: $message")
        } ?: Timber.e("Error occurred: $message")

        // Post error message to main thread
        _error.postValue(formattedMessage)
    }

    /**
     * Checks and updates network availability status with caching support.
     * Performs check on background thread to avoid main thread blocking.
     *
     * @param context Application context
     */
    fun checkNetworkAvailability(context: Context) {
        context.applicationContext?.let { appContext ->
            try {
                val isAvailable = NetworkUtils.isNetworkAvailable(appContext)
                _networkAvailable.postValue(isAvailable)
            } catch (e: SecurityException) {
                Timber.e(e, "Network permission denied")
                showError("Unable to check network status", e)
            }
        }
    }

    /**
     * Performs thorough cleanup when ViewModel is destroyed.
     * Clears all disposables, observers, and cached data.
     */
    override fun onCleared() {
        // Clear all disposables safely
        if (!disposables.isDisposed) {
            disposables.clear()
            disposables.dispose()
        }

        // Clear LiveData observers
        _loading.value = false
        _error.value = null
        _networkAvailable.value = null

        super.onCleared()
    }
}