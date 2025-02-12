import CoreData
import Foundation

/// Core Data managed object subclass representing a user entity with comprehensive validation and relationship management
/// Version: iOS SDK 14.0+
@objc(UserEntity)
@objcMembers
public class UserEntity: NSManagedObject {
    
    // MARK: - Properties
    @NSManaged public var id: String
    @NSManaged public var email: String
    @NSManaged public var name: String
    @NSManaged public var phone: String
    @NSManaged public var profileImageUrl: String?
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date
    @NSManaged public var applications: NSSet
    @NSManaged public var isEmailValid: Bool
    @NSManaged public var isPhoneValid: Bool
    
    // MARK: - Constants
    private enum Constants {
        static let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        static let phoneRegex = "^\\+?[1-9]\\d{1,14}$"
        static let entityName = "UserEntity"
    }
    
    // MARK: - Initialization
    public override init(entity: NSEntityDescription, insertInto context: NSManagedObjectContext?) {
        super.init(entity: entity, insertInto: context)
        
        // Initialize default values
        self.id = UUID().uuidString
        self.createdAt = Date()
        self.updatedAt = Date()
        self.applications = NSSet()
        self.isEmailValid = false
        self.isPhoneValid = false
        
        // Set up KVO for validation
        addObserver(self, forKeyPath: "email", options: .new, context: nil)
        addObserver(self, forKeyPath: "phone", options: .new, context: nil)
    }
    
    deinit {
        removeObserver(self, forKeyPath: "email")
        removeObserver(self, forKeyPath: "phone")
    }
    
    // MARK: - KVO
    public override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        guard let keyPath = keyPath else { return }
        
        switch keyPath {
        case "email":
            if let newEmail = change?[.newKey] as? String {
                _ = validateEmail(newEmail)
            }
        case "phone":
            if let newPhone = change?[.newKey] as? String {
                _ = validatePhone(newPhone)
            }
        default:
            super.observeValue(forKeyPath: keyPath, of: object, change: change, context: context)
        }
    }
    
    // MARK: - Validation Methods
    
    /// Validates email format using regex pattern
    /// - Parameter email: Email string to validate
    /// - Returns: True if email is valid
    public func validateEmail(_ email: String) -> Bool {
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", Constants.emailRegex)
        let isValid = emailPredicate.evaluate(with: email)
        
        willChangeValue(forKey: "isEmailValid")
        isEmailValid = isValid
        didChangeValue(forKey: "isEmailValid")
        
        NotificationCenter.default.post(
            name: NSNotification.Name("UserEmailValidationChanged"),
            object: self,
            userInfo: ["isValid": isValid]
        )
        
        return isValid
    }
    
    /// Validates phone number format
    /// - Parameter phone: Phone number string to validate
    /// - Returns: True if phone number is valid
    public func validatePhone(_ phone: String) -> Bool {
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", Constants.phoneRegex)
        let isValid = phonePredicate.evaluate(with: phone)
        
        willChangeValue(forKey: "isPhoneValid")
        isPhoneValid = isValid
        didChangeValue(forKey: "isPhoneValid")
        
        NotificationCenter.default.post(
            name: NSNotification.Name("UserPhoneValidationChanged"),
            object: self,
            userInfo: ["isValid": isValid]
        )
        
        return isValid
    }
    
    // MARK: - Relationship Management
    
    /// Thread-safe addition of application to user's applications set
    /// - Parameter application: ApplicationEntity to add
    public func addToApplications(_ application: ApplicationEntity) {
        managedObjectContext?.performAndWait { [weak self] in
            guard let self = self else { return }
            
            willChangeValue(forKey: "applications")
            
            let mutableApps = NSMutableSet(set: applications)
            mutableApps.add(application)
            applications = mutableApps as NSSet
            
            // Set inverse relationship
            application.applicantId = self.id
            
            didChangeValue(forKey: "applications")
            
            // Update timestamp
            updatedAt = Date()
        }
    }
    
    /// Thread-safe removal of application from user's applications set
    /// - Parameter application: ApplicationEntity to remove
    public func removeFromApplications(_ application: ApplicationEntity) {
        managedObjectContext?.performAndWait { [weak self] in
            guard let self = self else { return }
            
            willChangeValue(forKey: "applications")
            
            let mutableApps = NSMutableSet(set: applications)
            mutableApps.remove(application)
            applications = mutableApps as NSSet
            
            // Clear inverse relationship
            application.applicantId = ""
            
            didChangeValue(forKey: "applications")
            
            // Update timestamp
            updatedAt = Date()
        }
    }
}

// MARK: - Validation
extension UserEntity {
    public override func validateForInsert() throws {
        try super.validateForInsert()
        try validateRequiredFields()
    }
    
    public override func validateForUpdate() throws {
        try super.validateForUpdate()
        try validateRequiredFields()
    }
    
    private func validateRequiredFields() throws {
        guard !id.isEmpty else {
            throw NSError(domain: Constants.entityName, code: 1, userInfo: [
                NSLocalizedDescriptionKey: "User ID cannot be empty"
            ])
        }
        
        guard !email.isEmpty else {
            throw NSError(domain: Constants.entityName, code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Email cannot be empty"
            ])
        }
        
        guard !name.isEmpty else {
            throw NSError(domain: Constants.entityName, code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Name cannot be empty"
            ])
        }
        
        guard !phone.isEmpty else {
            throw NSError(domain: Constants.entityName, code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Phone number cannot be empty"
            ])
        }
        
        guard isEmailValid else {
            throw NSError(domain: Constants.entityName, code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Invalid email format"
            ])
        }
        
        guard isPhoneValid else {
            throw NSError(domain: Constants.entityName, code: 6, userInfo: [
                NSLocalizedDescriptionKey: "Invalid phone number format"
            ])
        }
    }
}