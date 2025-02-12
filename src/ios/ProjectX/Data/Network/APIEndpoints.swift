//
// APIEndpoints.swift
// ProjectX
//
// Type-safe API endpoint configuration with comprehensive security features
// Foundation version: iOS 15.0+
// CryptoKit version: iOS 15.0+
//

import Foundation
import CryptoKit

/// Base configuration for API endpoints
private enum APIConfig {
    static let baseURL = "https://api.projectx.com/v1"
    static let apiVersion = "v1"
    static let requestTimeout: TimeInterval = 30.0
    static let maxRetryAttempts = 3
}

/// Type-safe enumeration of all API endpoints with comprehensive configuration
public enum APIEndpoint {
    
    /// Authentication related endpoints
    public enum auth {
        case login
        case register
        case refreshToken
        
        var path: String {
            switch self {
            case .login: return "/auth/login"
            case .register: return "/auth/register"
            case .refreshToken: return "/auth/refresh"
            }
        }
        
        var method: HTTPMethod {
            switch self {
            case .login, .register, .refreshToken: return .post
            }
        }
        
        var requiresSigning: Bool {
            switch self {
            case .login, .register, .refreshToken: return true
            }
        }
    }
    
    /// Property listing related endpoints
    public enum properties {
        case search
        
        var path: String {
            switch self {
            case .search: return "/properties/search"
            }
        }
        
        var method: HTTPMethod {
            switch self {
            case .search: return .get
            }
        }
        
        var requiresSigning: Bool { false }
        
        var queryParameters: [String] {
            switch self {
            case .search: return ["page", "limit", "sort", "filter"]
            }
        }
    }
    
    /// HTTP methods supported by the API
    public enum HTTPMethod: String {
        case get = "GET"
        case post = "POST"
        case put = "PUT"
        case delete = "DELETE"
    }
    
    /// Constructs the complete URL for an endpoint with validation
    /// - Parameters:
    ///   - endpoint: The API endpoint
    ///   - queryParams: Optional query parameters
    ///   - pathParams: Optional path parameters
    /// - Returns: Result containing either the constructed URL or an error
    public static func url(for endpoint: APIEndpoint.auth,
                          queryParams: [String: String] = [:],
                          pathParams: [String: String] = [:]) -> Result<URL, APIError> {
        return constructURL(path: endpoint.path,
                          queryParams: queryParams,
                          pathParams: pathParams)
    }
    
    public static func url(for endpoint: APIEndpoint.properties,
                          queryParams: [String: String] = [:],
                          pathParams: [String: String] = [:]) -> Result<URL, APIError> {
        // Validate required query parameters
        let requiredParams = Set(endpoint.queryParameters)
        let providedParams = Set(queryParams.keys)
        let missingParams = requiredParams.subtracting(providedParams)
        
        guard missingParams.isEmpty else {
            return .failure(.invalidParameters("Missing required parameters: \(missingParams.joined(separator: ", "))"))
        }
        
        return constructURL(path: endpoint.path,
                          queryParams: queryParams,
                          pathParams: pathParams)
    }
    
    /// Constructs headers dictionary with security and monitoring features
    /// - Parameter authToken: Optional authentication token
    /// - Returns: Dictionary of headers
    public static func headers(for endpoint: APIEndpoint.auth,
                             authToken: String? = nil) -> [String: String] {
        var headers = [
            "Content-Type": "application/json",
            "X-Client-Version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            "X-Request-ID": UUID().uuidString,
            "User-Agent": userAgent
        ]
        
        if let token = authToken {
            headers["Authorization"] = "Bearer \(token)"
        }
        
        if endpoint.requiresSigning {
            headers["X-Request-Signature"] = generateRequestSignature()
        }
        
        return headers
    }
    
    public static func headers(for endpoint: APIEndpoint.properties,
                             authToken: String? = nil) -> [String: String] {
        var headers = [
            "Content-Type": "application/json",
            "Cache-Control": "max-age=300",
            "X-Rate-Limit": "100",
            "User-Agent": userAgent
        ]
        
        if let token = authToken {
            headers["Authorization"] = "Bearer \(token)"
        }
        
        return headers
    }
}

// MARK: - Private Helpers

private extension APIEndpoint {
    
    static var userAgent: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
        let device = UIDevice.current.model
        let systemVersion = UIDevice.current.systemVersion
        return "ProjectX/\(version) (\(device); iOS \(systemVersion)) Build/\(build)"
    }
    
    static func constructURL(path: String,
                           queryParams: [String: String],
                           pathParams: [String: String]) -> Result<URL, APIError> {
        var urlString = APIConfig.baseURL + path
        
        // Replace path parameters
        for (key, value) in pathParams {
            urlString = urlString.replacingOccurrences(of: "{\(key)}", with: value)
        }
        
        guard var components = URLComponents(string: urlString) else {
            return .failure(.invalidURL("Invalid base URL: \(urlString)"))
        }
        
        // Add query parameters
        if !queryParams.isEmpty {
            components.queryItems = queryParams.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        
        guard let url = components.url else {
            return .failure(.invalidURL("Failed to construct URL with components"))
        }
        
        return .success(url)
    }
    
    static func generateRequestSignature() -> String {
        let timestamp = Int(Date().timeIntervalSince1970)
        let nonce = UUID().uuidString
        
        // In a real implementation, this would use proper key management
        let signingKey = SymmetricKey(size: .bits256)
        let dataToSign = "\(timestamp):\(nonce)".data(using: .utf8)!
        
        let signature = HMAC<SHA256>.authenticationCode(for: dataToSign, using: signingKey)
        return Data(signature).base64EncodedString()
    }
}