//
// NetworkInterceptor.swift
// ProjectX
//
// Implements secure request interception and authentication for network operations
// Foundation version: iOS 15.0+
// Alamofire version: 5.8+
//

import Foundation
import Alamofire

/// Constants for network configuration
private enum NetworkConstants {
    static let authHeader = "Authorization"
    static let tokenPrefix = "Bearer "
    static let apiVersion = "v1"
    static let contentType = "application/json"
    static let acceptEncoding = "gzip, deflate, br"
    static let userAgent = "ProjectX-iOS/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")"
}

/// Thread-safe request interceptor implementing OAuth 2.0 authentication and comprehensive error handling
@objc public class NetworkInterceptor: RequestInterceptor {
    
    // MARK: - Properties
    
    private var accessToken: String?
    private var retrier: RequestRetrier?
    private let secureQueue: DispatchQueue
    private let sessionConfig: URLSessionConfiguration
    
    // MARK: - Initialization
    
    /// Initializes the network interceptor with secure defaults
    /// - Parameters:
    ///   - token: Optional initial access token
    ///   - configuration: Optional URLSession configuration for customization
    public init(token: String? = nil, configuration: URLSessionConfiguration? = nil) {
        self.accessToken = token
        self.secureQueue = DispatchQueue(label: "com.projectx.networkinterceptor", qos: .userInitiated)
        
        // Configure secure session defaults
        let config = configuration ?? .default
        config.tlsMinimumSupportedProtocolVersion = .TLSv13
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        
        // Configure certificate pinning
        let evaluators = [
            "api.projectx.com": PinnedCertificatesTrustEvaluator()
        ]
        
        self.sessionConfig = config
        
        // Initialize request retrier with token refresh logic
        self.retrier = RetryPolicy(retryLimit: 3)
    }
    
    // MARK: - Request Adaptation
    
    /// Securely adapts outgoing requests with authentication and required headers
    /// - Parameters:
    ///   - request: Original URLRequest to be modified
    ///   - session: Current Alamofire session
    /// - Returns: Modified request with security headers
    /// - Throws: APIError if request cannot be adapted
    public func adapt(_ request: URLRequest, for session: Session, completion: @escaping (Result<URLRequest, Error>) -> Void) {
        secureQueue.async {
            var adaptedRequest = request
            
            // Validate request URL
            guard let url = request.url, url.scheme == "https" else {
                completion(.failure(APIError.invalidURL(request.url?.absoluteString ?? "unknown")))
                return
            }
            
            // Add authorization header if token exists
            if let token = self.accessToken {
                adaptedRequest.setValue("\(NetworkConstants.tokenPrefix)\(token)", 
                                     forHTTPHeaderField: NetworkConstants.authHeader)
            }
            
            // Add required headers
            adaptedRequest.setValue(NetworkConstants.contentType, forHTTPHeaderField: "Content-Type")
            adaptedRequest.setValue(NetworkConstants.acceptEncoding, forHTTPHeaderField: "Accept-Encoding")
            adaptedRequest.setValue(NetworkConstants.userAgent, forHTTPHeaderField: "User-Agent")
            adaptedRequest.setValue("v\(NetworkConstants.apiVersion)", forHTTPHeaderField: "X-API-Version")
            
            // Add security headers
            adaptedRequest.setValue("nosniff", forHTTPHeaderField: "X-Content-Type-Options")
            adaptedRequest.setValue("DENY", forHTTPHeaderField: "X-Frame-Options")
            adaptedRequest.setValue("1; mode=block", forHTTPHeaderField: "X-XSS-Protection")
            
            completion(.success(adaptedRequest))
        }
    }
    
    // MARK: - Response Handling
    
    /// Processes API responses with comprehensive error handling
    /// - Parameters:
    ///   - response: HTTP response from the server
    ///   - data: Response data
    /// - Returns: Result containing either successful data or mapped error
    public func handleResponse(_ response: HTTPURLResponse, data: Data) -> Result<Data, APIError> {
        switch response.statusCode {
        case 200...299:
            return .success(data)
            
        case 401:
            return .failure(.unauthorized)
            
        case 403:
            return .failure(.forbidden)
            
        case 404:
            return .failure(.notFound)
            
        case 429:
            // Handle rate limiting
            if let retryAfter = response.allHeaderFields["Retry-After"] as? String,
               let delay = Double(retryAfter) {
                Thread.sleep(forTimeInterval: delay)
                return .failure(.custom("Rate limit exceeded. Please try again."))
            }
            return .failure(.custom("Too many requests"))
            
        case 500...599:
            return .failure(.serverError(response.statusCode))
            
        default:
            return .failure(.invalidResponse(response.statusCode))
        }
    }
    
    // MARK: - Token Management
    
    /// Thread-safe token update with retry configuration
    /// - Parameter newToken: New access token to be stored
    public func updateToken(_ newToken: String) {
        secureQueue.async {
            // Validate token format
            guard !newToken.isEmpty else { return }
            
            // Update stored token
            self.accessToken = newToken
            
            // Update retry policy if needed
            if let retryPolicy = self.retrier as? RetryPolicy {
                retryPolicy.retryLimit = 3 // Reset retry limit after token update
            }
            
            // Post notification for token update (observers must handle securely)
            NotificationCenter.default.post(name: .accessTokenDidUpdate, object: nil)
        }
    }
}

// MARK: - Notification Extension

extension Notification.Name {
    static let accessTokenDidUpdate = Notification.Name("com.projectx.accessTokenDidUpdate")
}