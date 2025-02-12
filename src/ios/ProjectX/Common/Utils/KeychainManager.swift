import Foundation
import Security

/// Error cases for Keychain operations
@objc public enum KeychainError: Int, Error {
    case itemNotFound
    case duplicateItem
    case invalidData
    case unhandledError(status: OSStatus)
    case invalidItemFormat
    case encryptionError
    case accessControlError
    case backgroundStateError
}

/// Service identifier for Keychain access
private let SERVICE_IDENTIFIER = "com.projectx.rental"

/// Access group identifier for Keychain sharing
private let KEYCHAIN_ACCESS_GROUP = "com.projectx.rental.keychain"

/// A thread-safe singleton class that manages secure storage and retrieval of sensitive data
/// using iOS Keychain with AES-256 encryption.
@objc public final class KeychainManager: NSObject {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    @objc public static let shared = KeychainManager()
    
    /// Service identifier for Keychain operations
    private let serviceIdentifier: String
    
    /// Dedicated serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Access group for Keychain sharing
    private let accessGroup: String
    
    /// Flag to control iCloud backup of Keychain items
    private let secureBackup: Bool
    
    // MARK: - Initialization
    
    private override init() {
        self.serviceIdentifier = SERVICE_IDENTIFIER
        self.accessGroup = KEYCHAIN_ACCESS_GROUP
        self.secureBackup = false
        self.queue = DispatchQueue(label: "com.projectx.rental.keychain",
                                 qos: .userInitiated,
                                 attributes: [],
                                 autoreleaseFrequency: .workItem,
                                 target: nil)
        
        super.init()
    }
    
    // MARK: - Public Methods
    
    /// Securely saves data to Keychain with AES-256 encryption
    /// - Parameters:
    ///   - data: The sensitive data to be stored
    ///   - key: Unique identifier for the stored item
    ///   - accessControl: Access control configuration for the item
    /// - Returns: Result indicating success or detailed error information
    @objc public func save(data: Data,
                          key: String,
                          accessControl: SecAccessControl? = nil) -> Result<Void, KeychainError> {
        return queue.sync {
            // Validate input
            guard !key.isEmpty else {
                return .failure(.invalidData)
            }
            
            // Prepare query dictionary
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup,
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                kSecUseDataProtectionKeychain as String: true
            ]
            
            // Configure encryption and access control
            if let accessControl = accessControl {
                query[kSecAttrAccessControl as String] = accessControl
            }
            
            // Configure backup prevention
            if !secureBackup {
                query[kSecAttrSynchronizable as String] = kCFBooleanFalse
            }
            
            // Attempt to save item
            let status = SecItemAdd(query as CFDictionary, nil)
            
            switch status {
            case errSecSuccess:
                return .success(())
            case errSecDuplicateItem:
                // Update existing item
                let updateQuery: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: serviceIdentifier,
                    kSecAttrAccount as String: key
                ]
                
                let updateAttributes: [String: Any] = [
                    kSecValueData as String: data
                ]
                
                let updateStatus = SecItemUpdate(updateQuery as CFDictionary,
                                               updateAttributes as CFDictionary)
                
                return updateStatus == errSecSuccess ? .success(()) : .failure(.unhandledError(status: updateStatus))
            default:
                return .failure(.unhandledError(status: status))
            }
        }
    }
    
    /// Retrieves and decrypts data from Keychain
    /// - Parameters:
    ///   - key: Unique identifier for the stored item
    ///   - accessControl: Access control configuration for retrieval
    /// - Returns: Result containing decrypted data or detailed error
    @objc public func retrieve(key: String,
                             accessControl: SecAccessControl? = nil) -> Result<Data, KeychainError> {
        return queue.sync {
            // Prepare query dictionary
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup,
                kSecReturnData as String: true,
                kSecUseDataProtectionKeychain as String: true
            ]
            
            // Configure access control if provided
            if let accessControl = accessControl {
                query[kSecAttrAccessControl as String] = accessControl
            }
            
            // Attempt to fetch item
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            
            switch status {
            case errSecSuccess:
                guard let data = result as? Data else {
                    return .failure(.invalidItemFormat)
                }
                return .success(data)
            case errSecItemNotFound:
                return .failure(.itemNotFound)
            default:
                return .failure(.unhandledError(status: status))
            }
        }
    }
    
    /// Securely deletes data from Keychain
    /// - Parameter key: Unique identifier for the item to delete
    /// - Returns: Result indicating success or detailed error information
    @objc public func delete(key: String) -> Result<Void, KeychainError> {
        return queue.sync {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup
            ]
            
            let status = SecItemDelete(query as CFDictionary)
            
            switch status {
            case errSecSuccess, errSecItemNotFound:
                return .success(())
            default:
                return .failure(.unhandledError(status: status))
            }
        }
    }
    
    /// Securely removes all app data from Keychain
    /// - Returns: Result indicating success or detailed error information
    @objc public func clear() -> Result<Void, KeychainError> {
        return queue.sync {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccessGroup as String: accessGroup
            ]
            
            let status = SecItemDelete(query as CFDictionary)
            
            switch status {
            case errSecSuccess, errSecItemNotFound:
                return .success(())
            default:
                return .failure(.unhandledError(status: status))
            }
        }
    }
}