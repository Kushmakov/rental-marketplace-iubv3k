//
// AuthService.swift
// ProjectX
//
// Service class responsible for handling authentication operations with enhanced security
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// OSLog version: iOS 15.0+
//

import Foundation
import Combine
import OSLog
import LocalAuthentication

// MARK: - Constants

private let AUTH_QUEUE = DispatchQueue(label: "com.projectx.auth", qos: .userInitiated)
private let TOKEN_KEY = "auth_token"
private let REFRESH_TOKEN_KEY = "refresh_token"
private let MAX_RETRY_ATTEMPTS = 3

// MARK: - Supporting Types

/// Authentication event types for monitoring
public enum AuthEvent {
    case loginSuccess
    case loginFailure(Error)
    case tokenRefresh
    case logoutSuccess
    case biometricSuccess
    case biometricFailure(Error)
}

/// Authentication result containing tokens and user info
public struct AuthResult {
    let accessToken: String
    let refreshToken: String
    let expiresIn: TimeInterval
    let tokenType: String
}

/// Biometric authentication options
public struct BiometricOptions {
    let localizedReason: String
    let fallbackTitle: String?
    let cancelTitle: String?
    let policy: LAPolicy
    
    public init(
        localizedReason: String,
        fallbackTitle: String? = nil,
        cancelTitle: String? = nil,
        policy: LAPolicy = .deviceOwnerAuthenticationWithBiometrics
    ) {
        self.localizedReason = localizedReason
        self.fallbackTitle = fallbackTitle
        self.cancelTitle = cancelTitle
        self.policy = policy
    }
}

// MARK: - AuthService

/// Thread-safe authentication service with comprehensive security features
public final class AuthService {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = AuthService()
    
    /// Publisher for authentication events
    public let authEventPublisher = PassthroughSubject<AuthEvent, Never>()
    
    private let authQueue: DispatchQueue
    private let logger: Logger
    private let secureStorage: KeychainWrapper
    private var refreshTask: AnyCancellable?
    private var tokenRefreshPolicy: RetryPolicy
    
    // MARK: - Initialization
    
    private init() {
        self.authQueue = AUTH_QUEUE
        self.logger = Logger(subsystem: "com.projectx.auth", category: "AuthService")
        self.secureStorage = KeychainWrapper.standard
        
        // Configure token refresh retry policy
        self.tokenRefreshPolicy = RetryPolicy(
            retryLimit: MAX_RETRY_ATTEMPTS,
            exponentialBackoff: true,
            initialDelay: 1.0
        )
        
        // Setup security monitoring
        setupSecurityMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Authenticates user with biometric verification
    /// - Parameter options: Biometric authentication options
    /// - Returns: Publisher emitting authentication result or error
    public func authenticateWithBiometrics(
        options: BiometricOptions
    ) -> AnyPublisher<AuthResult, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.custom("AuthService deallocated")))
                return
            }
            
            let context = LAContext()
            var error: NSError?
            
            // Check biometric availability
            guard context.canEvaluatePolicy(options.policy, error: &error) else {
                self.logger.error("Biometric authentication unavailable: \(String(describing: error))")
                promise(.failure(.custom("Biometric authentication unavailable")))
                return
            }
            
            // Configure authentication context
            context.localizedFallbackTitle = options.fallbackTitle
            context.localizedCancelTitle = options.cancelTitle
            
            // Perform biometric authentication
            context.evaluatePolicy(
                options.policy,
                localizedReason: options.localizedReason
            ) { [weak self] success, error in
                guard let self = self else { return }
                
                if success {
                    // Proceed with token refresh after successful biometric auth
                    self.refreshTokenWithRetry()
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    promise(.failure(error))
                                }
                            },
                            receiveValue: { _ in
                                // Construct auth result from stored tokens
                                if let accessToken = self.secureStorage.string(forKey: TOKEN_KEY),
                                   let refreshToken = self.secureStorage.string(forKey: REFRESH_TOKEN_KEY) {
                                    let result = AuthResult(
                                        accessToken: accessToken,
                                        refreshToken: refreshToken,
                                        expiresIn: 3600,
                                        tokenType: "Bearer"
                                    )
                                    promise(.success(result))
                                    self.authEventPublisher.send(.biometricSuccess)
                                } else {
                                    promise(.failure(.custom("Token retrieval failed")))
                                }
                            }
                        )
                        .store(in: &self.refreshTask)
                } else {
                    let authError = error ?? NSError(domain: "com.projectx.auth", code: -1)
                    self.logger.error("Biometric authentication failed: \(authError)")
                    self.authEventPublisher.send(.biometricFailure(authError))
                    promise(.failure(.custom("Biometric authentication failed")))
                }
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Refreshes authentication token with retry mechanism
    /// - Returns: Publisher indicating success or failure
    public func refreshTokenWithRetry() -> AnyPublisher<Void, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.custom("AuthService deallocated")))
                return
            }
            
            guard let refreshToken = self.secureStorage.string(forKey: REFRESH_TOKEN_KEY) else {
                promise(.failure(.unauthorized))
                return
            }
            
            // Attempt token refresh with retry policy
            APIClient.shared.request(
                APIEndpoint.auth.refreshToken,
                parameters: ["refresh_token": refreshToken]
            )
            .retry(self.tokenRefreshPolicy)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.logger.error("Token refresh failed: \(error)")
                        promise(.failure(error))
                    }
                },
                receiveValue: { (response: AuthResult) in
                    // Store new tokens securely
                    self.authQueue.async {
                        self.secureStorage.set(response.accessToken, forKey: TOKEN_KEY)
                        self.secureStorage.set(response.refreshToken, forKey: REFRESH_TOKEN_KEY)
                        
                        // Update API client token
                        APIClient.shared.updateAuthToken(response.accessToken)
                        
                        self.logger.info("Token refresh successful")
                        self.authEventPublisher.send(.tokenRefresh)
                        promise(.success(()))
                    }
                }
            )
            .store(in: &self.refreshTask)
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupSecurityMonitoring() {
        // Monitor app state for security events
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in
                self?.logger.info("App entering background - securing sensitive data")
                self?.secureBackgroundTransition()
            }
            .store(in: &refreshTask)
        
        // Monitor authentication state changes
        NotificationCenter.default.publisher(for: .accessTokenDidUpdate)
            .sink { [weak self] _ in
                self?.logger.info("Access token updated")
                self?.validateTokenIntegrity()
            }
            .store(in: &refreshTask)
    }
    
    private func secureBackgroundTransition() {
        authQueue.async {
            // Clear sensitive memory
            self.refreshTask?.cancel()
            self.refreshTask = nil
            
            // Validate token storage
            self.validateTokenIntegrity()
        }
    }
    
    private func validateTokenIntegrity() {
        authQueue.async {
            guard let accessToken = self.secureStorage.string(forKey: TOKEN_KEY),
                  let refreshToken = self.secureStorage.string(forKey: REFRESH_TOKEN_KEY),
                  !accessToken.isEmpty,
                  !refreshToken.isEmpty else {
                self.logger.error("Token integrity check failed")
                self.authEventPublisher.send(.loginFailure(AuthError.unauthorized))
                return
            }
        }
    }
}