//
// UserDefaultsManager.swift
// ProjectX
//
// Thread-safe singleton manager for secure UserDefaults storage operations
// Foundation version: iOS 14.0+
//

import Foundation

/// Keys used for UserDefaults storage
private enum UserDefaultsKeys {
    static let accessToken = "access_token"
    static let refreshToken = "refresh_token"
    static let userId = "user_id"
    static let userEmail = "user_email"
    static let lastSyncTimestamp = "last_sync_timestamp"
    static let searchHistory = "search_history"
    static let recentProperties = "recent_properties"
    static let appTheme = "app_theme"
    static let notificationSettings = "notification_settings"
    static let encryptionKey = "encryption_key"
    static let dataVersion = "data_version"
}

@objc public class UserDefaultsManager: NSObject {
    
    // MARK: - Properties
    
    private let defaults: UserDefaults
    private let serialQueue: DispatchQueue
    private var encryptionKey: Data?
    private let memoryCache: NSCache<NSString, AnyObject>
    
    /// Shared singleton instance
    @objc public static let shared = UserDefaultsManager()
    
    // MARK: - Initialization
    
    private override init() {
        self.defaults = UserDefaults.standard
        self.serialQueue = DispatchQueue(label: "com.projectx.userdefaults", qos: .userInitiated)
        self.memoryCache = NSCache<NSString, AnyObject>()
        
        super.init()
        
        // Configure memory cache limits
        memoryCache.totalCostLimit = Storage.MAX_CACHE_SIZE_MB * 1024 * 1024
        
        // Setup encryption key if not exists
        setupEncryptionKey()
        
        // Register defaults
        registerDefaults()
        
        // Setup notification observers
        setupNotificationObservers()
    }
    
    // MARK: - Private Methods
    
    private func setupEncryptionKey() {
        if let existingKey = defaults.data(forKey: UserDefaultsKeys.encryptionKey) {
            self.encryptionKey = existingKey
        } else {
            // Generate new encryption key
            var newKey = Data(count: 32) // 256-bit key
            _ = newKey.withUnsafeMutableBytes { bytes in
                SecRandomCopyBytes(kSecRandomDefault, 32, bytes.baseAddress!)
            }
            self.encryptionKey = newKey
            defaults.set(newKey, forKey: UserDefaultsKeys.encryptionKey)
        }
    }
    
    private func registerDefaults() {
        let defaultValues: [String: Any] = [
            UserDefaultsKeys.dataVersion: "1.0",
            UserDefaultsKeys.searchHistory: [],
            UserDefaultsKeys.recentProperties: [],
            UserDefaultsKeys.appTheme: "system",
            UserDefaultsKeys.notificationSettings: ["enabled": true]
        ]
        defaults.register(defaults: defaultValues)
    }
    
    private func setupNotificationObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func handleMemoryWarning() {
        memoryCache.removeAllObjects()
    }
    
    private func encrypt(_ data: Data) throws -> Data {
        guard let key = encryptionKey else {
            throw NSError(domain: "com.projectx.userdefaults", code: -1, userInfo: [NSLocalizedDescriptionKey: "Encryption key not available"])
        }
        
        let algorithm = SecKeyAlgorithm.rsaEncryptionOAEPSHA256
        var error: Void?
        
        guard let encryptedData = SecKeyCreateEncryptedData(
            key as CFData,
            algorithm,
            data as CFData,
            &error as NSError?
        ) as Data? else {
            throw NSError(domain: "com.projectx.userdefaults", code: -2, userInfo: [NSLocalizedDescriptionKey: "Encryption failed"])
        }
        
        return encryptedData
    }
    
    private func decrypt(_ data: Data) throws -> Data {
        guard let key = encryptionKey else {
            throw NSError(domain: "com.projectx.userdefaults", code: -1, userInfo: [NSLocalizedDescriptionKey: "Encryption key not available"])
        }
        
        let algorithm = SecKeyAlgorithm.rsaEncryptionOAEPSHA256
        var error: Void?
        
        guard let decryptedData = SecKeyCreateDecryptedData(
            key as CFData,
            algorithm,
            data as CFData,
            &error as NSError?
        ) as Data? else {
            throw NSError(domain: "com.projectx.userdefaults", code: -3, userInfo: [NSLocalizedDescriptionKey: "Decryption failed"])
        }
        
        return decryptedData
    }
    
    // MARK: - Public Methods
    
    @objc public func saveAccessToken(_ token: String) {
        serialQueue.async {
            do {
                let tokenData = token.data(using: .utf8)!
                let encryptedData = try self.encrypt(tokenData)
                
                self.defaults.set(encryptedData, forKey: UserDefaultsKeys.accessToken)
                self.memoryCache.setObject(token as NSString, forKey: UserDefaultsKeys.accessToken as NSString)
                self.defaults.synchronize()
                
                NotificationCenter.default.post(name: .accessTokenDidChange, object: nil)
            } catch {
                print("Error saving access token: \(error)")
            }
        }
    }
    
    @objc public func getAccessToken() -> String? {
        // Check memory cache first
        if let cachedToken = memoryCache.object(forKey: UserDefaultsKeys.accessToken as NSString) as? String {
            return cachedToken
        }
        
        var token: String?
        serialQueue.sync {
            guard let encryptedData = defaults.data(forKey: UserDefaultsKeys.accessToken) else {
                return
            }
            
            do {
                let decryptedData = try decrypt(encryptedData)
                token = String(data: decryptedData, encoding: .utf8)
                
                // Update memory cache
                if let token = token {
                    memoryCache.setObject(token as NSString, forKey: UserDefaultsKeys.accessToken as NSString)
                }
            } catch {
                print("Error retrieving access token: \(error)")
            }
        }
        
        return token
    }
    
    @objc public func batchUpdate(_ updates: [String: Any]) {
        serialQueue.async {
            for (key, value) in updates {
                self.defaults.set(value, forKey: key)
                
                // Update memory cache for cacheable values
                if let stringValue = value as? String {
                    self.memoryCache.setObject(stringValue as NSString, forKey: key as NSString)
                }
            }
            
            self.defaults.synchronize()
            NotificationCenter.default.post(name: .userDefaultsDidUpdate, object: nil)
        }
    }
    
    @objc public func clearStorage() {
        serialQueue.async {
            let domain = Bundle.main.bundleIdentifier!
            self.defaults.removePersistentDomain(forName: domain)
            self.memoryCache.removeAllObjects()
            self.setupEncryptionKey() // Generate new encryption key
            self.registerDefaults() // Re-register defaults
            
            NotificationCenter.default.post(name: .userDefaultsDidClear, object: nil)
        }
    }
    
    // MARK: - Deinitializer
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - Notification Names

public extension Notification.Name {
    static let accessTokenDidChange = Notification.Name("com.projectx.userdefaults.accessTokenDidChange")
    static let userDefaultsDidUpdate = Notification.Name("com.projectx.userdefaults.didUpdate")
    static let userDefaultsDidClear = Notification.Name("com.projectx.userdefaults.didClear")
}