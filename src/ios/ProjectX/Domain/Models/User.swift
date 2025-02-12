import Foundation
import CoreData

/// Error type for user validation failures
enum UserValidationError: Error {
    case invalidEmail
    case invalidPhone
    case emptyRequiredField(String)
}

/// Thread-safe domain model representing a user in the rental platform
@frozen
public struct User {
    // MARK: - Properties
    
    public let id: String
    public let email: String
    public let name: String
    public let phone: String
    public let profileImageUrl: String?
    public let createdAt: Date
    public let updatedAt: Date
    
    // MARK: - Constants
    
    private static let emailRegex = "(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|\"(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21\\x23-\\x5b\\x5d-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*\")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21-\\x5a\\x53-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])+)\\])"
    
    private static let phoneRegex = "^\\+[1-9]\\d{1,14}$"
    
    // MARK: - Initialization
    
    /// Initialize a new User instance with validation
    /// - Parameters:
    ///   - id: Unique identifier for the user
    ///   - email: User's email address (must be RFC 5322 compliant)
    ///   - name: User's full name
    ///   - phone: User's phone number (must be E.164 compliant)
    ///   - profileImageUrl: Optional URL to user's profile image
    ///   - createdAt: Timestamp of user creation
    ///   - updatedAt: Timestamp of last update
    /// - Throws: UserValidationError if validation fails
    public init(id: String,
                email: String,
                name: String,
                phone: String,
                profileImageUrl: String? = nil,
                createdAt: Date,
                updatedAt: Date) throws {
        
        // Validate required fields
        guard !id.isEmpty else {
            throw UserValidationError.emptyRequiredField("id")
        }
        guard !email.isEmpty else {
            throw UserValidationError.emptyRequiredField("email")
        }
        guard !name.isEmpty else {
            throw UserValidationError.emptyRequiredField("name")
        }
        guard !phone.isEmpty else {
            throw UserValidationError.emptyRequiredField("phone")
        }
        
        // Validate email format
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", Self.emailRegex)
        guard emailPredicate.evaluate(with: email) else {
            throw UserValidationError.invalidEmail
        }
        
        // Validate phone format
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", Self.phoneRegex)
        guard phonePredicate.evaluate(with: phone) else {
            throw UserValidationError.invalidPhone
        }
        
        self.id = id
        self.email = email
        self.name = name
        self.phone = phone
        self.profileImageUrl = profileImageUrl
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
    
    // MARK: - Public Methods
    
    /// Convert User model to UserEntity for Core Data persistence
    /// - Parameter context: NSManagedObjectContext for entity creation
    /// - Returns: Core Data entity representation of the user
    public func toEntity(in context: NSManagedObjectContext) -> UserEntity {
        let entity = UserEntity(context: context)
        entity.id = id
        entity.email = email
        entity.name = name
        entity.phone = phone
        entity.profileImageUrl = profileImageUrl
        entity.createdAt = createdAt
        entity.updatedAt = updatedAt
        return entity
    }
    
    /// Validate user data according to business rules
    /// - Returns: Result indicating validation success or failure
    public func validate() -> Result<Void, UserValidationError> {
        // Check required fields
        guard !id.isEmpty else {
            return .failure(.emptyRequiredField("id"))
        }
        guard !email.isEmpty else {
            return .failure(.emptyRequiredField("email"))
        }
        guard !name.isEmpty else {
            return .failure(.emptyRequiredField("name"))
        }
        guard !phone.isEmpty else {
            return .failure(.emptyRequiredField("phone"))
        }
        
        // Validate email format
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", Self.emailRegex)
        guard emailPredicate.evaluate(with: email) else {
            return .failure(.invalidEmail)
        }
        
        // Validate phone format
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", Self.phoneRegex)
        guard phonePredicate.evaluate(with: phone) else {
            return .failure(.invalidPhone)
        }
        
        return .success(())
    }
}

// MARK: - Equatable
extension User: Equatable {
    public static func == (lhs: User, rhs: User) -> Bool {
        return lhs.id == rhs.id &&
               lhs.email == rhs.email &&
               lhs.name == rhs.name &&
               lhs.phone == rhs.phone &&
               lhs.profileImageUrl == rhs.profileImageUrl &&
               lhs.createdAt == rhs.createdAt &&
               lhs.updatedAt == rhs.updatedAt
    }
}

// MARK: - Hashable
extension User: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(email)
        hasher.combine(name)
        hasher.combine(phone)
        hasher.combine(profileImageUrl)
        hasher.combine(createdAt)
        hasher.combine(updatedAt)
    }
}