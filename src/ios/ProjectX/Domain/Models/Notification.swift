import Foundation
import Combine
import os.lock

// MARK: - Enums

enum NotificationType: String, Codable, CaseIterable {
    case email = "EMAIL"
    case sms = "SMS"
    case inApp = "IN_APP"
    case push = "PUSH"
}

enum NotificationStatus: String, Codable, CaseIterable {
    case pending = "PENDING"
    case sent = "SENT"
    case delivered = "DELIVERED"
    case failed = "FAILED"
    case archived = "ARCHIVED"
}

enum NotificationError: Error {
    case invalidContent
    case invalidStatusTransition
    case contentSizeExceeded
}

// MARK: - Notification Model

@objc final class Notification: NSObject {
    // MARK: - Properties
    
    let id: String
    let type: NotificationType
    let userId: String
    let title: String
    var content: [String: Any]
    private(set) var status: NotificationStatus
    private(set) var sentAt: Date?
    private(set) var readAt: Date?
    let createdAt: Date
    private(set) var updatedAt: Date
    
    private var statusLock: os_unfair_lock_t
    private let contentSizeLimit: Int = 1024 * 1024 // 1MB limit
    
    // MARK: - Initialization
    
    init(id: String,
         type: NotificationType,
         userId: String,
         title: String,
         content: [String: Any],
         status: NotificationStatus = .pending,
         sentAt: Date? = nil,
         readAt: Date? = nil,
         createdAt: Date = Date(),
         updatedAt: Date = Date()) throws {
        
        // Validate content size
        guard JSONSerialization.isValidJSONObject(content),
              let contentData = try? JSONSerialization.data(withJSONObject: content),
              contentData.count <= contentSizeLimit else {
            throw NotificationError.contentSizeExceeded
        }
        
        self.id = id
        self.type = type
        self.userId = userId
        self.title = title
        self.content = content
        self.status = status
        self.sentAt = sentAt
        self.readAt = readAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.statusLock = os_unfair_lock_t()
        
        super.init()
    }
    
    // MARK: - Status Management
    
    func updateStatus(_ newStatus: NotificationStatus) -> Result<Void, NotificationError> {
        os_unfair_lock_lock(&statusLock)
        defer { os_unfair_lock_unlock(&statusLock) }
        
        // Validate status transition
        switch (status, newStatus) {
        case (.pending, .sent),
             (.sent, .delivered),
             (.sent, .failed),
             (.delivered, .archived),
             (.failed, .archived):
            break
        default:
            return .failure(.invalidStatusTransition)
        }
        
        status = newStatus
        updatedAt = Date()
        
        if newStatus == .sent {
            sentAt = Date()
        }
        
        return .success(())
    }
    
    func markAsRead() {
        os_unfair_lock_lock(&statusLock)
        defer { os_unfair_lock_unlock(&statusLock) }
        
        readAt = Date()
        updatedAt = Date()
    }
    
    func archive() -> Result<Void, NotificationError> {
        guard status == .delivered || status == .failed else {
            return .failure(.invalidStatusTransition)
        }
        
        // Compress content if needed
        if let contentData = try? JSONSerialization.data(withJSONObject: content) {
            content = ["archived_content": contentData.base64EncodedString()]
        }
        
        return updateStatus(.archived)
    }
}

// MARK: - Notification Preferences

@objc final class NotificationPreference: NSObject {
    // MARK: - Properties
    
    let userId: String
    let type: NotificationType
    var enabled: Bool
    var channels: [NotificationType]
    var channelConfig: [String: Any]
    private(set) var updatedAt: Date
    
    // MARK: - Initialization
    
    init(userId: String,
         type: NotificationType,
         enabled: Bool = true,
         channels: [NotificationType],
         channelConfig: [String: Any]) {
        
        self.userId = userId
        self.type = type
        self.enabled = enabled
        self.channels = channels
        self.channelConfig = channelConfig
        self.updatedAt = Date()
        
        super.init()
        
        // Set default channel priorities if not specified
        if channelConfig["priorities"] == nil {
            self.channelConfig["priorities"] = channels.enumerated().reduce(into: [String: Int]()) { dict, channel in
                dict[channel.element.rawValue] = channel.offset
            }
        }
    }
}