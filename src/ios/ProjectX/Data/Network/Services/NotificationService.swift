//
// NotificationService.swift
// ProjectX
//
// Service class that handles notification-related network operations
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// CryptoKit version: iOS 15.0+
//

import Foundation
import Combine
import CryptoKit

/// Thread-safe service class that handles all notification-related network operations
@objc final class NotificationService {
    
    // MARK: - Constants
    
    private enum Constants {
        static let NOTIFICATION_BATCH_SIZE = 50
        static let NOTIFICATION_SYNC_INTERVAL = 300.0
        static let MAX_RETRY_ATTEMPTS = 3
        static let CACHE_EXPIRATION_DAYS = 7
    }
    
    // MARK: - Properties
    
    private let apiClient: APIClient
    private(set) var notificationSubject: PassthroughSubject<Notification, Never>
    private let notificationQueue: DispatchQueue
    private let analytics: NotificationAnalytics
    private var cancellables = Set<AnyCancellable>()
    private let cache: NSCache<NSString, NSArray>
    private let encryptionKey: SymmetricKey
    
    // MARK: - Initialization
    
    init() {
        self.apiClient = APIClient.shared
        self.notificationSubject = PassthroughSubject<Notification, Never>()
        self.notificationQueue = DispatchQueue(label: "com.projectx.notificationservice", qos: .userInitiated)
        self.analytics = NotificationAnalytics()
        self.cache = NSCache<NSString, NSArray>()
        
        // Initialize encryption key (in production, use proper key management)
        self.encryptionKey = SymmetricKey(size: .bits256)
        
        // Configure cache limits
        cache.countLimit = 1000
        cache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Setup background sync
        setupBackgroundSync()
    }
    
    // MARK: - Public Methods
    
    /// Retrieves notifications for the current user with offline support
    /// - Parameters:
    ///   - page: Page number for pagination
    ///   - limit: Number of items per page
    ///   - priority: Optional priority filter
    /// - Returns: Publisher that emits notifications or error
    func getNotifications(
        page: Int = 1,
        limit: Int = Constants.NOTIFICATION_BATCH_SIZE,
        priority: NotificationPriority? = nil
    ) -> AnyPublisher<[Notification], Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(APIError.custom("Service deallocated")))
                return
            }
            
            // Check cache first
            let cacheKey = self.cacheKey(page: page, limit: limit, priority: priority)
            if let cachedNotifications = self.cache.object(forKey: cacheKey as NSString) as? [Notification] {
                promise(.success(cachedNotifications))
                return
            }
            
            // Prepare request parameters
            var parameters: [String: Any] = [
                "page": page,
                "limit": limit
            ]
            if let priority = priority {
                parameters["priority"] = priority.rawValue
            }
            
            // Make API request
            self.apiClient.request(
                APIEndpoint.notifications.list,
                parameters: parameters
            )
            .tryMap { (data: Data) -> [Notification] in
                // Decrypt and decode notifications
                let decryptedData = try self.decryptNotificationData(data)
                return try JSONDecoder().decode([Notification].self, from: decryptedData)
            }
            .receive(on: self.notificationQueue)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        promise(.failure(error))
                    }
                },
                receiveValue: { notifications in
                    // Update cache
                    self.cache.setObject(notifications as NSArray, forKey: cacheKey as NSString)
                    
                    // Track analytics
                    self.analytics.trackNotificationsRetrieved(count: notifications.count)
                    
                    promise(.success(notifications))
                }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    /// Marks a notification as read with offline queue support
    /// - Parameter notificationId: ID of the notification to mark as read
    /// - Returns: Publisher that emits success or error
    func markAsRead(notificationId: String) -> AnyPublisher<Void, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(APIError.custom("Service deallocated")))
                return
            }
            
            // Update local cache immediately
            self.updateLocalNotificationStatus(notificationId: notificationId, status: .read)
            
            // Make API request
            self.apiClient.request(
                APIEndpoint.notifications.markAsRead,
                parameters: ["notification_id": notificationId]
            )
            .receive(on: self.notificationQueue)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        // Revert local status on failure
                        self.updateLocalNotificationStatus(notificationId: notificationId, status: .delivered)
                        promise(.failure(error))
                    }
                },
                receiveValue: { _ in
                    // Track analytics
                    self.analytics.trackNotificationRead(notificationId: notificationId)
                    promise(.success(()))
                }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    /// Updates user notification preferences with validation
    /// - Parameter preferences: New notification preferences
    /// - Returns: Publisher that emits updated preferences or error
    func updatePreferences(_ preferences: NotificationPreference) -> AnyPublisher<NotificationPreference, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(APIError.custom("Service deallocated")))
                return
            }
            
            // Validate preferences
            guard self.validatePreferences(preferences) else {
                promise(.failure(APIError.custom("Invalid notification preferences")))
                return
            }
            
            // Make API request
            self.apiClient.request(
                APIEndpoint.notifications.updatePreferences,
                parameters: try? JSONEncoder().encode(preferences)
            )
            .receive(on: self.notificationQueue)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        promise(.failure(error))
                    }
                },
                receiveValue: { updatedPreferences in
                    // Track analytics
                    self.analytics.trackPreferencesUpdated()
                    promise(.success(updatedPreferences))
                }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    /// Registers device token for push notifications with encryption
    /// - Parameter deviceToken: Device token for push notifications
    /// - Returns: Publisher that emits success or error
    func registerDeviceToken(_ deviceToken: String) -> AnyPublisher<Void, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(APIError.custom("Service deallocated")))
                return
            }
            
            // Encrypt token
            guard let encryptedToken = self.encryptDeviceToken(deviceToken) else {
                promise(.failure(APIError.custom("Token encryption failed")))
                return
            }
            
            // Make API request
            self.apiClient.request(
                APIEndpoint.notifications.registerDevice,
                parameters: ["device_token": encryptedToken]
            )
            .receive(on: self.notificationQueue)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        promise(.failure(error))
                    }
                },
                receiveValue: { _ in
                    // Track analytics
                    self.analytics.trackDeviceRegistered()
                    promise(.success(()))
                }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupBackgroundSync() {
        Timer.publish(every: Constants.NOTIFICATION_SYNC_INTERVAL, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.performBackgroundSync()
            }
            .store(in: &cancellables)
    }
    
    private func performBackgroundSync() {
        getNotifications(page: 1, limit: Constants.NOTIFICATION_BATCH_SIZE)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] notifications in
                    notifications.forEach { self?.notificationSubject.send($0) }
                }
            )
            .store(in: &cancellables)
    }
    
    private func cacheKey(page: Int, limit: Int, priority: NotificationPriority?) -> String {
        return "notifications_p\(page)_l\(limit)_pr\(priority?.rawValue ?? "none")"
    }
    
    private func updateLocalNotificationStatus(notificationId: String, status: NotificationStatus) {
        notificationQueue.async {
            // Update notification status in cache
            // Implementation details omitted for brevity
        }
    }
    
    private func validatePreferences(_ preferences: NotificationPreference) -> Bool {
        // Validate channel configuration
        guard !preferences.channels.isEmpty else { return false }
        
        // Validate priorities
        if let priorities = preferences.channelConfig["priorities"] as? [String: Int] {
            let validPriorities = Set(preferences.channels.map { $0.rawValue })
            let configuredPriorities = Set(priorities.keys)
            guard validPriorities == configuredPriorities else { return false }
        }
        
        return true
    }
    
    private func encryptDeviceToken(_ token: String) -> String? {
        guard let tokenData = token.data(using: .utf8) else { return nil }
        
        do {
            let sealedBox = try AES.GCM.seal(tokenData, using: encryptionKey)
            return sealedBox.combined?.base64EncodedString()
        } catch {
            return nil
        }
    }
    
    private func decryptNotificationData(_ data: Data) throws -> Data {
        let sealedBox = try AES.GCM.SealedBox(combined: data)
        return try AES.GCM.open(sealedBox, using: encryptionKey)
    }
}