//
// APIError.swift
// ProjectX
//
// Comprehensive error handling system for network operations
// Foundation version: iOS 15.0+
//

import Foundation

/// A comprehensive enumeration of all possible API errors that can occur during network operations.
/// Provides type-safe error handling with associated values for detailed error context.
@frozen
public enum APIError: LocalizedError, Equatable {
    /// Network connectivity issues or transport layer errors
    case networkError(Error)
    
    /// URL formation or validation errors
    case invalidURL(String)
    
    /// Invalid or unexpected API response format with status code
    case invalidResponse(Int)
    
    /// JSON decoding failures with detailed error information
    case decodingError(Error)
    
    /// 401 unauthorized errors when authentication token is missing or invalid
    case unauthorized
    
    /// 403 forbidden errors when user lacks permission for requested operation
    case forbidden
    
    /// 404 errors when requested resource doesn't exist
    case notFound
    
    /// 5xx server errors with status code
    case serverError(Int)
    
    /// Custom error messages from API responses
    case custom(String)
    
    /// Provides a human-readable localized description of the error suitable for display to users
    public var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return NSLocalizedString("Network error occurred: \(error.localizedDescription)", 
                                   comment: "Network error message")
            
        case .invalidURL(let url):
            return NSLocalizedString("Invalid URL format: \(url)", 
                                   comment: "Invalid URL error message")
            
        case .invalidResponse(let statusCode):
            return NSLocalizedString("Server returned invalid response (Status: \(statusCode))", 
                                   comment: "Invalid response error message")
            
        case .decodingError(let error):
            return NSLocalizedString("Failed to process server response: \(error.localizedDescription)", 
                                   comment: "Decoding error message")
            
        case .unauthorized:
            return NSLocalizedString("Authentication required. Please sign in to continue.", 
                                   comment: "Unauthorized error message")
            
        case .forbidden:
            return NSLocalizedString("You don't have permission to perform this action.", 
                                   comment: "Forbidden error message")
            
        case .notFound:
            return NSLocalizedString("The requested resource was not found.", 
                                   comment: "Not found error message")
            
        case .serverError(let statusCode):
            return NSLocalizedString("Server error occurred (Status: \(statusCode)). Please try again later.", 
                                   comment: "Server error message")
            
        case .custom(let message):
            return NSLocalizedString(message, 
                                   comment: "Custom error message")
        }
    }
    
    /// Equatable conformance implementation
    public static func == (lhs: APIError, rhs: APIError) -> Bool {
        switch (lhs, rhs) {
        case (.networkError(let lhsError), .networkError(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
            
        case (.invalidURL(let lhsURL), .invalidURL(let rhsURL)):
            return lhsURL == rhsURL
            
        case (.invalidResponse(let lhsCode), .invalidResponse(let rhsCode)):
            return lhsCode == rhsCode
            
        case (.decodingError(let lhsError), .decodingError(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
            
        case (.unauthorized, .unauthorized):
            return true
            
        case (.forbidden, .forbidden):
            return true
            
        case (.notFound, .notFound):
            return true
            
        case (.serverError(let lhsCode), .serverError(let rhsCode)):
            return lhsCode == rhsCode
            
        case (.custom(let lhsMessage), .custom(let rhsMessage)):
            return lhsMessage == rhsMessage
            
        default:
            return false
        }
    }
}