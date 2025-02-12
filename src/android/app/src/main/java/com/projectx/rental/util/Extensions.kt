package com.projectx.rental.util

import android.content.res.Configuration
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.core.view.ViewCompat
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestOptions
import com.projectx.rental.util.Constants.VALIDATION.EMAIL_PATTERN
import com.projectx.rental.util.Constants.VALIDATION.PHONE_PATTERN
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import timber.log.Timber

/**
 * Extension functions providing utility functionality for Android views and common types.
 * Implements enterprise-grade error handling, accessibility support, and RTL considerations.
 * Version: 1.0.0
 */

// Cache for date formatters to improve performance
private val dateFormatCache = ConcurrentHashMap<String, SimpleDateFormat>()

/**
 * Sets view visibility to VISIBLE with accessibility announcement.
 * Handles RTL layout considerations.
 */
fun View.visible() {
    visibility = View.VISIBLE
    // Announce visibility change for accessibility
    ViewCompat.announceForAccessibility(this, contentDescription)
    // Handle RTL layout if necessary
    if (resources.configuration.layoutDirection == Configuration.SCREENLAYOUT_LAYOUTDIR_RTL) {
        layoutDirection = View.LAYOUT_DIRECTION_RTL
    }
}

/**
 * Sets view visibility to INVISIBLE with accessibility announcement.
 */
fun View.invisible() {
    visibility = View.INVISIBLE
    ViewCompat.announceForAccessibility(this, "${contentDescription ?: ""} hidden")
}

/**
 * Sets view visibility to GONE with accessibility announcement.
 */
fun View.gone() {
    visibility = View.GONE
    ViewCompat.announceForAccessibility(this, "${contentDescription ?: ""} removed")
}

/**
 * Loads and caches images using Glide with enhanced error handling and memory optimization.
 * @param url Image URL to load
 * @param placeholder Placeholder resource ID
 * @param error Error resource ID
 * @param centerCrop Whether to apply centerCrop transformation
 */
fun ImageView.loadImage(
    url: String?,
    placeholder: Int? = null,
    error: Int? = null,
    centerCrop: Boolean = true
) {
    try {
        val requestOptions = RequestOptions().apply {
            if (centerCrop) centerCrop()
            diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
            placeholder?.let { placeholder(it) }
            error?.let { error(it) }
        }

        Glide.with(context)
            .load(url)
            .apply(requestOptions)
            .into(this)
            .also { request ->
                // Set tag for memory management
                setTag(request)
            }
    } catch (e: Exception) {
        Timber.e(e, "Error loading image from URL: $url")
        error?.let { setImageResource(it) }
    }
}

/**
 * Formats number as currency with locale support.
 * @param locale Desired locale for formatting (defaults to system locale)
 * @return Formatted currency string
 */
fun Double?.formatAsCurrency(locale: Locale = Locale.getDefault()): String {
    return try {
        if (this == null) return ""
        NumberFormat.getCurrencyInstance(locale).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }.format(this)
    } catch (e: Exception) {
        Timber.e(e, "Error formatting currency: $this")
        String.format(locale, "%.2f", this ?: 0.0)
    }
}

/**
 * Formats timestamp as date string with timezone support.
 * @param pattern Date format pattern
 * @param timeZone Desired timezone (defaults to system timezone)
 * @return Formatted date string
 */
fun Long?.formatAsDate(
    pattern: String,
    timeZone: TimeZone = TimeZone.getDefault()
): String {
    return try {
        if (this == null) return ""
        
        // Get or create cached formatter
        val formatter = dateFormatCache.getOrPut(pattern) {
            SimpleDateFormat(pattern, Locale.getDefault()).apply {
                this.timeZone = timeZone
            }
        }
        
        formatter.format(Date(this))
    } catch (e: Exception) {
        Timber.e(e, "Error formatting date: $this with pattern: $pattern")
        ""
    }
}

/**
 * Validates email format using regex pattern.
 * @return True if email is valid
 */
fun String?.isValidEmail(): Boolean {
    return try {
        !this.isNullOrBlank() && EMAIL_PATTERN.toRegex().matches(this)
    } catch (e: Exception) {
        Timber.e(e, "Error validating email: $this")
        false
    }
}

/**
 * Validates phone number format using E.164 pattern.
 * @return True if phone number is valid
 */
fun String?.isValidPhone(): Boolean {
    return try {
        !this.isNullOrBlank() && PHONE_PATTERN.toRegex().matches(this)
    } catch (e: Exception) {
        Timber.e(e, "Error validating phone number: $this")
        false
    }
}

/**
 * Sets error text with accessibility announcement.
 * @param error Error message to display
 */
fun EditText.setErrorWithAnnouncement(error: String?) {
    this.error = error
    error?.let {
        ViewCompat.announceForAccessibility(this, it)
    }
}

/**
 * Sets text with proper RTL handling and accessibility support.
 * @param text Text to set
 * @param isRTL Whether text should be displayed RTL
 */
fun TextView.setTextWithDirection(text: CharSequence?, isRTL: Boolean = false) {
    this.text = text
    if (isRTL) {
        textDirection = View.TEXT_DIRECTION_RTL
        textAlignment = View.TEXT_ALIGNMENT_VIEW_START
    } else {
        textDirection = View.TEXT_DIRECTION_LTR
        textAlignment = View.TEXT_ALIGNMENT_VIEW_START
    }
}

/**
 * Safely handles click events with debouncing.
 * @param debounceTime Time in milliseconds to prevent double clicks
 * @param action Action to perform on click
 */
fun View.setSafeClickListener(debounceTime: Long = 500L, action: () -> Unit) {
    var lastClickTime = 0L
    setOnClickListener {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastClickTime > debounceTime) {
            lastClickTime = currentTime
            action.invoke()
        }
    }
}

/**
 * Extension to clear Glide image loading request when view is detached.
 */
fun ImageView.clearGlideRequest() {
    try {
        Glide.with(context).clear(this)
        setImageDrawable(null)
    } catch (e: Exception) {
        Timber.e(e, "Error clearing Glide request")
    }
}