import Foundation
import LocalAuthentication
import os.log

/// Comprehensive error types for biometric authentication
@objc public enum BiometricAuthError: Int, Error {
    case notAvailable(String)
    case notEnrolled(String)
    case lockout(String)
    case cancelled
    case failed(Error?)
    case unknown(Error?)
}

/// Key for storing biometric authentication state in Keychain
private let BIOMETRIC_STATE_KEY = "biometric_auth_enabled"

/// Queue label for thread synchronization
private let QUEUE_LABEL = "com.projectx.biometricauth.queue"

/// Thread-safe singleton class that manages biometric authentication functionality
@objc public final class BiometricAuthManager: NSObject {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    @objc public static let shared = BiometricAuthManager()
    
    /// Local Authentication context
    private var context: LAContext
    
    /// Reference to KeychainManager for secure storage
    private let keychainManager: KeychainManager
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Logger for security events
    private let logger = Logger(subsystem: "com.projectx.rental", category: "BiometricAuth")
    
    // MARK: - Initialization
    
    private override init() {
        // Initialize with thread safety
        self.queue = DispatchQueue(label: QUEUE_LABEL, qos: .userInitiated)
        self.context = LAContext()
        self.keychainManager = KeychainManager.shared
        
        super.init()
        
        // Configure context with maximum security
        context.interactionNotAllowed = false
        context.localizedFallbackTitle = ""
        
        // Set up app state observers
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cleanupAuthenticationSession),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - Public Methods
    
    /// Checks if biometric authentication is available and configured
    @objc public func isBiometricAuthAvailable() -> Bool {
        return queue.sync {
            var error: NSError?
            let canEvaluate = context.canEvaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                error: &error
            )
            
            if let error = error {
                logger.error("Biometric availability check failed: \(error.localizedDescription)")
                return false
            }
            
            logger.info("Biometric authentication available: \(canEvaluate)")
            return canEvaluate
        }
    }
    
    /// Performs biometric authentication with comprehensive error handling
    /// - Parameters:
    ///   - reason: Localized reason for authentication request
    ///   - fallbackEnabled: Whether to allow fallback authentication
    /// - Returns: Result indicating success or detailed error information
    @objc public func authenticateWithBiometrics(
        reason: String,
        fallbackEnabled: Bool = false
    ) -> Result<Bool, BiometricAuthError> {
        return queue.sync {
            // Validate availability
            guard isBiometricAuthAvailable() else {
                let error = "Biometric authentication not available"
                logger.error("\(error)")
                return .failure(.notAvailable(error))
            }
            
            // Configure authentication context
            let newContext = LAContext()
            newContext.localizedFallbackTitle = fallbackEnabled ? "Use Passcode" : ""
            self.context = newContext
            
            // Perform authentication
            var authError: NSError?
            let semaphore = DispatchSemaphore(value: 0)
            var authResult: Result<Bool, BiometricAuthError> = .failure(.unknown(nil))
            
            context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            ) { success, error in
                if success {
                    // Store authentication state securely
                    if case .success = self.keychainManager.save(
                        data: Data([1]),
                        key: BIOMETRIC_STATE_KEY
                    ) {
                        self.logger.info("Biometric authentication successful")
                        authResult = .success(true)
                    } else {
                        self.logger.error("Failed to save authentication state")
                        authResult = .failure(.failed(nil))
                    }
                } else if let error = error as NSError? {
                    self.logger.error("Authentication failed: \(error.localizedDescription)")
                    switch error.code {
                    case LAError.authenticationFailed.rawValue:
                        authResult = .failure(.failed(error))
                    case LAError.userCancel.rawValue:
                        authResult = .failure(.cancelled)
                    case LAError.biometryNotEnrolled.rawValue:
                        authResult = .failure(.notEnrolled(error.localizedDescription))
                    case LAError.biometryLockout.rawValue:
                        authResult = .failure(.lockout(error.localizedDescription))
                    default:
                        authResult = .failure(.unknown(error))
                    }
                }
                semaphore.signal()
            }
            
            _ = semaphore.wait(timeout: .now() + 30.0)
            return authResult
        }
    }
    
    /// Cleans up authentication session and sensitive data
    @objc private func cleanupAuthenticationSession() {
        queue.async {
            self.context.invalidate()
            self.context = LAContext()
            self.logger.info("Authentication session cleaned up")
        }
    }
}