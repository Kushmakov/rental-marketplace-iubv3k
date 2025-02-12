package com.projectx.rental.ui.common

import android.os.Bundle
import android.view.View
import android.view.accessibility.AccessibilityEvent
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.projectx.rental.ui.common.BaseViewModel
import com.projectx.rental.util.NetworkUtils
import io.reactivex.rxjava3.disposables.CompositeDisposable
import timber.log.Timber

/**
 * Abstract base fragment class providing common functionality for all fragments
 * in the rental application. Implements error handling, loading state management,
 * and network connectivity monitoring with enhanced error logging and memory leak prevention.
 *
 * @version 1.0
 */
abstract class BaseFragment : Fragment() {

    // Abstract property to be implemented by child fragments
    protected abstract val viewModel: BaseViewModel

    // Nullable view reference with proper cleanup
    private var _rootView: View? = null
    protected val rootView: View get() = _rootView ?: throw IllegalStateException("Root view is null")

    // CompositeDisposable for managing RxJava subscriptions
    protected val disposables = CompositeDisposable()

    // Error display threshold to prevent spam
    private var lastErrorTime = 0L
    private val ERROR_THRESHOLD_MS = 3000L

    /**
     * Sets up the fragment view with observers and network monitoring.
     * Implements enhanced error handling and accessibility support.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        _rootView = view

        // Set up loading state observer
        viewModel.loading.observe(viewLifecycleOwner, Observer { isLoading ->
            if (isLoading) {
                showLoading()
            } else {
                hideLoading()
            }
        })

        // Set up error observer with rate limiting
        viewModel.error.observe(viewLifecycleOwner, Observer { error ->
            error?.let {
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastErrorTime > ERROR_THRESHOLD_MS) {
                    showError(it)
                    lastErrorTime = currentTime
                }
            }
        })

        // Set up network availability observer
        viewModel.networkAvailable.observe(viewLifecycleOwner, Observer { isAvailable ->
            if (isAvailable == false) {
                showNetworkError()
            }
        })

        // Initialize network monitoring
        context?.let {
            viewModel.checkNetworkAvailability(it)
        }
    }

    /**
     * Shows loading indicator with accessibility announcement.
     */
    protected fun showLoading() {
        _rootView?.let { view ->
            view.announceForAccessibility(getString(android.R.string.loading))
            // Implement your loading UI here
            Timber.d("Loading state shown")
        }
    }

    /**
     * Hides loading indicator with accessibility announcement.
     */
    protected fun hideLoading() {
        _rootView?.let { view ->
            view.announceForAccessibility(getString(android.R.string.ok))
            // Hide your loading UI here
            Timber.d("Loading state hidden")
        }
    }

    /**
     * Shows error message with analytics tracking and accessibility support.
     *
     * @param message The error message to display
     */
    protected fun showError(message: String) {
        _rootView?.let { view ->
            Snackbar.make(view, message, Snackbar.LENGTH_LONG)
                .setAnchorView(view.findViewById(android.R.id.content))
                .setAction("Dismiss") { /* dismiss */ }
                .show()

            // Announce error for accessibility
            view.announceForAccessibility(message)

            // Log error for analytics
            Timber.e("Error displayed: $message")
        }
    }

    /**
     * Shows network error dialog with retry option.
     */
    protected fun showNetworkError() {
        context?.let { ctx ->
            MaterialAlertDialogBuilder(ctx)
                .setTitle("Network Error")
                .setMessage("Please check your internet connection and try again.")
                .setPositiveButton("Retry") { dialog, _ ->
                    viewModel.checkNetworkAvailability(ctx)
                    dialog.dismiss()
                }
                .setNegativeButton("Cancel") { dialog, _ ->
                    dialog.dismiss()
                }
                .show()
        }
    }

    /**
     * Performs thorough cleanup when fragment view is destroyed.
     * Prevents memory leaks and resource leaks.
     */
    override fun onDestroyView() {
        // Clear all disposables
        if (!disposables.isDisposed) {
            disposables.clear()
            disposables.dispose()
        }

        // Clear view references
        _rootView = null

        super.onDestroyView()
    }

    /**
     * Performs cleanup when fragment is destroyed.
     * Ensures all resources are properly released.
     */
    override fun onDestroy() {
        // Final cleanup
        disposables.dispose()
        super.onDestroy()
    }

    /**
     * Helper function to safely execute code that requires a valid view.
     */
    protected fun withView(block: (View) -> Unit) {
        _rootView?.let { view ->
            if (view.isAttachedToWindow) {
                block(view)
            }
        }
    }

    /**
     * Helper function to check if fragment is active and can perform UI operations.
     */
    protected fun isActive(): Boolean {
        return isAdded && !isDetached && _rootView != null
    }
}