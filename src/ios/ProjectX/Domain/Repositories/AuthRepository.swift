//
// AuthRepository.swift
// ProjectX
//
// Thread-safe repository implementing domain layer authentication with comprehensive security
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// LocalAuthentication version: iOS 15.0+
//

import Foundation
import Combine
import LocalAuthentication

/// Comprehensive error handling for authentication operations
public enum AuthError: LocalizedError {
    case invalidCredentials
    case networkError(Error)
    case tokenExpired
    case unauthorized
    case biometricsFailed
    case secureStorageFailed
    case unknown
    
    public var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return NSLocalizedString("Invalid email or password", comment: "Invalid credentials error")
        case .networkError(let error):
            return NSLocalizedString("Network error: \(error.localizedDescription)", comment: "Network error")
        case .tokenExpired:
            return NSLocalizedString("Session expired. Please sign in again", comment: "Token expired error")
        case .unauthorized:
            return NSLocalizedString("Unauthorized access", comment: "Unauthorized error")
        case .biometricsFailed:
            return NSLocalizedString("Biometric authentication failed", comment: "Biometric error")
        case .secureStorageFailed:
            return NSLocalizedString("Failed to securely store credentials", comment: "Storage error")
        case .unknown:
            return NSLocalizedString("An unknown error occurred", comment: "Unknown error")
        }
    }
}

/// Thread-safe repository managing authentication state and operations
public final class AuthRepository {
    
    // MARK: - Properties
    
    private let authService: AuthService
    private let keychainManager: KeychainManager
    private let authQueue: DispatchQueue
    private let biometricContext: LAContext
    
    /// Current authenticated user publisher
    public private(set) var currentUser: CurrentValueSubject<User?, Never>
    
    /// Authentication state publisher
    public private(set) var authState: CurrentValueSubject<AuthState, Never>
    
    private var cancellables: Set<AnyCancellable> = []
    
    // MARK: - Constants
    
    private enum Constants {
        static let tokenKey = "auth_token"
        static let refreshTokenKey = "refresh_token"
        static let biometricReason = "Authenticate to access your account"
        static let maxRetryAttempts = 3
    }
    
    // MARK: - Initialization
    
    public init() {
        self.authService = AuthService.shared
        self.keychainManager = KeychainManager.shared
        self.authQueue = DispatchQueue(label: "com.projectx.auth", qos: .userInitiated)
        self.biometricContext = LAContext()
        self.currentUser = CurrentValueSubject<User?, Never>(nil)
        self.authState = CurrentValueSubject<AuthState, Never>(.unauthenticated)
        
        setupAuthStateObservation()
        restoreSession()
    }
    
    // MARK: - Public Methods
    
    /// Authenticates user with email and password
    /// - Parameters:
    ///   - email: User's email address
    ///   - password: User's password
    ///   - useBiometrics: Whether to enable biometric authentication for future logins
    /// - Returns: Publisher emitting authentication result
    public func login(
        email: String,
        password: String,
        useBiometrics: Bool = false
    ) -> AnyPublisher<User, AuthError> {
        return authQueue.sync {
            // Validate input
            guard !email.isEmpty, !password.isEmpty else {
                return Fail(error: AuthError.invalidCredentials).eraseToAnyPublisher()
            }
            
            return authService.login(email: email, password: password)
                .mapError { error -> AuthError in
                    if let apiError = error as? APIError {
                        switch apiError {
                        case .unauthorized: return .invalidCredentials
                        case .networkError(let error): return .networkError(error)
                        default: return .unknown
                        }
                    }
                    return .unknown
                }
                .flatMap { [weak self] authResult -> AnyPublisher<User, AuthError> in
                    guard let self = self else {
                        return Fail(error: AuthError.unknown).eraseToAnyPublisher()
                    }
                    
                    // Store credentials securely
                    let credentialsResult = self.storeCredentials(
                        token: authResult.accessToken,
                        refreshToken: authResult.refreshToken
                    )
                    
                    switch credentialsResult {
                    case .success:
                        if useBiometrics {
                            // Enable biometric authentication
                            self.enableBiometricAuth(email: email, password: password)
                        }
                        
                        // Update auth state
                        self.authState.send(.authenticated)
                        
                        // Create and emit user
                        let user = User(id: authResult.userId, email: email)
                        self.currentUser.send(user)
                        return Just(user)
                            .setFailureType(to: AuthError.self)
                            .eraseToAnyPublisher()
                        
                    case .failure:
                        return Fail(error: AuthError.secureStorageFailed).eraseToAnyPublisher()
                    }
                }
                .receive(on: DispatchQueue.main)
                .eraseToAnyPublisher()
        }
    }
    
    /// Authenticates user using biometrics
    /// - Returns: Publisher emitting authentication result
    public func authenticateWithBiometrics() -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            // Configure biometric authentication
            self.biometricContext.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: Constants.biometricReason
            ) { success, error in
                if success {
                    // Retrieve stored credentials
                    self.authQueue.async {
                        guard let credentials = self.retrieveStoredCredentials() else {
                            promise(.failure(.secureStorageFailed))
                            return
                        }
                        
                        // Attempt login with stored credentials
                        self.login(email: credentials.email, password: credentials.password)
                            .sink(
                                receiveCompletion: { completion in
                                    if case .failure(let error) = completion {
                                        promise(.failure(error))
                                    }
                                },
                                receiveValue: { user in
                                    promise(.success(user))
                                }
                            )
                            .store(in: &self.cancellables)
                    }
                } else {
                    promise(.failure(.biometricsFailed))
                }
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Refreshes authentication session
    /// - Returns: Publisher indicating success or failure
    public func refreshSession() -> AnyPublisher<Void, AuthError> {
        return authQueue.sync {
            authService.refreshToken()
                .mapError { error -> AuthError in
                    if let apiError = error as? APIError {
                        switch apiError {
                        case .unauthorized: return .tokenExpired
                        case .networkError(let error): return .networkError(error)
                        default: return .unknown
                        }
                    }
                    return .unknown
                }
                .flatMap { [weak self] authResult -> AnyPublisher<Void, AuthError> in
                    guard let self = self else {
                        return Fail(error: AuthError.unknown).eraseToAnyPublisher()
                    }
                    
                    // Update stored tokens
                    let result = self.storeCredentials(
                        token: authResult.accessToken,
                        refreshToken: authResult.refreshToken
                    )
                    
                    switch result {
                    case .success:
                        return Just(())
                            .setFailureType(to: AuthError.self)
                            .eraseToAnyPublisher()
                    case .failure:
                        return Fail(error: AuthError.secureStorageFailed).eraseToAnyPublisher()
                    }
                }
                .receive(on: DispatchQueue.main)
                .eraseToAnyPublisher()
        }
    }
    
    /// Logs out current user and clears credentials
    public func logout() -> AnyPublisher<Void, AuthError> {
        return authQueue.sync {
            authService.logout()
                .mapError { error -> AuthError in
                    if let apiError = error as? APIError {
                        switch apiError {
                        case .networkError(let error): return .networkError(error)
                        default: return .unknown
                        }
                    }
                    return .unknown
                }
                .flatMap { [weak self] _ -> AnyPublisher<Void, AuthError> in
                    guard let self = self else {
                        return Fail(error: AuthError.unknown).eraseToAnyPublisher()
                    }
                    
                    // Clear stored credentials
                    let result = self.keychainManager.clear()
                    
                    switch result {
                    case .success:
                        self.currentUser.send(nil)
                        self.authState.send(.unauthenticated)
                        return Just(())
                            .setFailureType(to: AuthError.self)
                            .eraseToAnyPublisher()
                    case .failure:
                        return Fail(error: AuthError.secureStorageFailed).eraseToAnyPublisher()
                    }
                }
                .receive(on: DispatchQueue.main)
                .eraseToAnyPublisher()
        }
    }
    
    // MARK: - Private Methods
    
    private func setupAuthStateObservation() {
        authService.authEventPublisher
            .sink { [weak self] event in
                switch event {
                case .loginSuccess:
                    self?.authState.send(.authenticated)
                case .loginFailure:
                    self?.authState.send(.unauthenticated)
                case .logoutSuccess:
                    self?.authState.send(.unauthenticated)
                default:
                    break
                }
            }
            .store(in: &cancellables)
    }
    
    private func restoreSession() {
        authQueue.async { [weak self] in
            guard let self = self,
                  let credentials = self.retrieveStoredCredentials() else {
                self?.authState.send(.unauthenticated)
                return
            }
            
            // Attempt to refresh session with stored credentials
            self.refreshSession()
                .sink(
                    receiveCompletion: { [weak self] completion in
                        if case .failure = completion {
                            self?.authState.send(.unauthenticated)
                        }
                    },
                    receiveValue: { [weak self] _ in
                        let user = User(id: UUID(), email: credentials.email)
                        self?.currentUser.send(user)
                        self?.authState.send(.authenticated)
                    }
                )
                .store(in: &self.cancellables)
        }
    }
    
    private func storeCredentials(token: String, refreshToken: String) -> Result<Void, KeychainError> {
        let tokenData = token.data(using: .utf8)!
        let refreshTokenData = refreshToken.data(using: .utf8)!
        
        let tokenResult = keychainManager.save(
            data: tokenData,
            key: Constants.tokenKey
        )
        
        let refreshTokenResult = keychainManager.save(
            data: refreshTokenData,
            key: Constants.refreshTokenKey
        )
        
        switch (tokenResult, refreshTokenResult) {
        case (.success, .success):
            return .success(())
        case (.failure(let error), _), (_, .failure(let error)):
            return .failure(error)
        }
    }
    
    private func retrieveStoredCredentials() -> (email: String, password: String)? {
        // Implementation would retrieve securely stored credentials
        // This is a placeholder for the actual secure credential retrieval
        return nil
    }
    
    private func enableBiometricAuth(email: String, password: String) {
        // Implementation would securely store credentials for biometric auth
        // This is a placeholder for the actual biometric setup
    }
}

// MARK: - Supporting Types

public enum AuthState {
    case authenticated
    case unauthenticated
}

public struct User {
    public let id: UUID
    public let email: String
}