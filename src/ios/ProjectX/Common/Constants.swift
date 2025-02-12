//
// Constants.swift
// ProjectX
//
// Global configuration constants for the ProjectX rental marketplace iOS application
// Foundation version: iOS 15.0+
//

import Foundation

/// API configuration constants for REST API integration
public struct API {
    /// Base URL for the ProjectX API
    public static let BASE_URL = "https://api.projectx.com"
    
    /// API version path component
    public static let VERSION = "/api/v1"
    
    /// Network request timeout interval in seconds
    public static let TIMEOUT: TimeInterval = 30.0
    
    /// Maximum number of retry attempts for failed requests
    public static let MAX_RETRIES: Int = 3
    
    // Prevent initialization
    private init() {}
}

/// Storage and caching configuration constants
public struct Storage {
    /// Maximum cache size in megabytes
    public static let MAX_CACHE_SIZE_MB: Int = 100
    
    /// Cache expiration period in days
    public static let CACHE_EXPIRY_DAYS: Int = 7
    
    /// Maximum size for image cache in megabytes
    public static let IMAGE_CACHE_SIZE_MB: Int = 50
    
    // Prevent initialization
    private init() {}
}

/// UI configuration constants
public struct UI {
    /// Default animation duration in seconds
    public static let ANIMATION_DURATION: TimeInterval = 0.3
    
    /// Default corner radius for UI elements
    public static let CORNER_RADIUS: CGFloat = 8.0
    
    /// Default shadow opacity for UI elements
    public static let SHADOW_OPACITY: Float = 0.1
    
    /// Default shadow radius for UI elements
    public static let SHADOW_RADIUS: CGFloat = 4.0
    
    // Prevent initialization
    private init() {}
}

/// Validation rules and limits
public struct Validation {
    /// Minimum required password length
    public static let MIN_PASSWORD_LENGTH: Int = 8
    
    /// Maximum number of images allowed per property
    public static let MAX_PROPERTY_IMAGES: Int = 10
    
    /// Maximum file size in megabytes for uploads
    public static let MAX_FILE_SIZE_MB: Int = 10
    
    // Prevent initialization
    private init() {}
}