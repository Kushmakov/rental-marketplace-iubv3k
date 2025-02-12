package com.projectx.rental.util

/**
 * Centralized constants for the Project X Rental Android application.
 * Contains configuration values, API endpoints, and other static values used throughout the app.
 * Version: 1.0.0
 */

object API {
    // Production environment
    const val BASE_URL = "https://api.projectx.com/v1/"
    // Staging environment for pre-production testing
    const val STAGING_URL = "https://api-staging.projectx.com/v1/"
    // Development environment for testing
    const val DEV_URL = "https://api-dev.projectx.com/v1/"
    // API version
    const val VERSION = "1.0.0"
    
    // Network timeouts (in seconds)
    const val CONNECT_TIMEOUT_SECONDS = 30L
    const val READ_TIMEOUT_SECONDS = 30L
    const val WRITE_TIMEOUT_SECONDS = 30L
    const val RETRY_COUNT = 3
}

object AUTH {
    // JWT token storage keys
    const val ACCESS_TOKEN_KEY = "access_token"
    const val REFRESH_TOKEN_KEY = "refresh_token"
    const val TOKEN_TYPE = "Bearer"
    const val TOKEN_EXPIRY_KEY = "token_expiry"
    
    // OAuth 2.0 configuration
    const val OAUTH_CLIENT_ID = "project_x_android_client"
    const val OAUTH_REDIRECT_URI = "projectx://oauth/callback"
    const val OAUTH_SCOPE = "read write profile"
}

object DATABASE {
    const val NAME = "projectx_rental.db"
    const val VERSION = 1
    val MIGRATION_VERSIONS = arrayOf(1, 2, 3) // Supported migration versions
    const val EXPORT_SCHEMA = true
}

object PREFERENCES {
    const val FILE_NAME = "projectx_preferences"
    const val USER_PREFERENCES_KEY = "user_preferences"
    const val APP_PREFERENCES_KEY = "app_preferences"
    const val ENCRYPTION_KEY_ALIAS = "projectx_encryption_key"
}

object VALIDATION {
    const val PASSWORD_MIN_LENGTH = 8
    const val PASSWORD_MAX_LENGTH = 32
    const val PASSWORD_PATTERN = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=])(?=\\S+$).{8,}$"
    const val EMAIL_PATTERN = "[a-zA-Z0-9._-]+@[a-z]+\\.+[a-z]+"
    const val PHONE_PATTERN = "^\\+?[1-9]\\d{1,14}$" // E.164 format
    const val ZIP_CODE_PATTERN = "^[0-9]{5}(?:-[0-9]{4})?$" // US ZIP code format
}

object PAYMENT {
    const val CURRENCY_CODE = "USD"
    const val CURRENCY_FORMAT = "$#,##0.00"
    
    object TRANSACTION_TYPES {
        const val RENT = "RENT"
        const val DEPOSIT = "DEPOSIT"
        const val APPLICATION_FEE = "APPLICATION_FEE"
        const val LATE_FEE = "LATE_FEE"
    }
    
    object PAYMENT_STATUSES {
        const val PENDING = "PENDING"
        const val PROCESSING = "PROCESSING"
        const val COMPLETED = "COMPLETED"
        const val FAILED = "FAILED"
        const val REFUNDED = "REFUNDED"
    }
    
    const val STRIPE_PUBLIC_KEY = "pk_test_your_stripe_key" // Replace with actual key in production
}

object BIOMETRIC {
    const val PROMPT_TITLE = "Biometric Authentication"
    const val PROMPT_SUBTITLE = "Verify your identity"
    const val PROMPT_DESCRIPTION = "Use your biometric credential to authenticate"
    const val AUTHENTICATION_DURATION_MS = 30000L // 30 seconds
    
    object ERROR_MESSAGES {
        const val HARDWARE_UNAVAILABLE = "Biometric hardware is currently unavailable"
        const val BIOMETRIC_INVALIDATED = "Biometric data has been invalidated"
        const val NO_BIOMETRICS_ENROLLED = "No biometric credentials are enrolled"
        const val BIOMETRIC_ERROR_UNKNOWN = "An unknown error occurred"
    }
}