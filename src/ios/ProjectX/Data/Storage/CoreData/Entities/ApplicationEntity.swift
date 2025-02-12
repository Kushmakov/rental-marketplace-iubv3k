import CoreData
import Foundation

// CoreData entity representing a rental application
// Version: iOS SDK 14.0+
@objc(ApplicationEntity)
public class ApplicationEntity: NSManagedObject {
    
    // MARK: - Properties
    @NSManaged public var id: String
    @NSManaged public var status: String
    @NSManaged public var monthlyIncome: Double
    @NSManaged public var employmentStatus: String
    @NSManaged public var currentAddress: String
    @NSManaged public var creditScore: String
    @NSManaged public var documents: NSSet
    @NSManaged public var notes: String
    @NSManaged public var applicantId: String
    @NSManaged public var propertyId: String
    @NSManaged public var submittedAt: Date
    @NSManaged public var updatedAt: Date
    @NSManaged public var isSync: Bool
    @NSManaged public var syncStatus: String
    @NSManaged public var encryptedData: Data
    
    // MARK: - Constants
    private enum Constants {
        static let defaultStatus = "draft"
        static let pendingSyncStatus = "pending"
    }
    
    // MARK: - Initialization
    public override init(entity: NSEntityDescription, insertInto context: NSManagedObjectContext?) {
        super.init(entity: entity, insertInto: context)
        
        // Initialize default values
        self.id = UUID().uuidString
        self.status = Constants.defaultStatus
        self.documents = NSSet()
        self.updatedAt = Date()
        self.isSync = false
        self.syncStatus = Constants.pendingSyncStatus
        self.encryptedData = Data()
    }
    
    // MARK: - Document Management
    
    /// Adds a document URL to the application's documents set
    /// - Parameter documentUrl: The URL of the document to add
    public func addToDocuments(_ documentUrl: String) {
        guard URL(string: documentUrl) != nil else {
            assertionFailure("Invalid document URL format")
            return
        }
        
        willChangeValue(forKey: "documents")
        
        let mutableDocs = NSMutableSet(set: documents)
        mutableDocs.add(documentUrl)
        documents = mutableDocs as NSSet
        
        didChangeValue(forKey: "documents")
        
        updateSyncState()
    }
    
    /// Removes a document URL from the application's documents set
    /// - Parameter documentUrl: The URL of the document to remove
    public func removeFromDocuments(_ documentUrl: String) {
        guard documents.contains(documentUrl) else { return }
        
        willChangeValue(forKey: "documents")
        
        let mutableDocs = NSMutableSet(set: documents)
        mutableDocs.remove(documentUrl)
        documents = mutableDocs as NSSet
        
        didChangeValue(forKey: "documents")
        
        updateSyncState()
    }
    
    /// Updates the application status with validation
    /// - Parameter newStatus: The new status to set
    public func updateStatus(_ newStatus: String) {
        let validStatuses = ["draft", "submitted", "under_review", "approved", "rejected"]
        guard validStatuses.contains(newStatus) else {
            assertionFailure("Invalid application status")
            return
        }
        
        willChangeValue(forKey: "status")
        status = newStatus
        didChangeValue(forKey: "status")
        
        if newStatus == "submitted" {
            submittedAt = Date()
        }
        
        updateSyncState()
    }
    
    // MARK: - Private Helpers
    
    private func updateSyncState() {
        isSync = false
        syncStatus = Constants.pendingSyncStatus
        updatedAt = Date()
        
        // Notify observers of changes
        NotificationCenter.default.post(
            name: NSNotification.Name("ApplicationEntityDidChange"),
            object: self
        )
    }
}

// MARK: - Validation
extension ApplicationEntity {
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
            throw NSError(domain: "ApplicationEntity", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Application ID cannot be empty"
            ])
        }
        
        guard !propertyId.isEmpty else {
            throw NSError(domain: "ApplicationEntity", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Property ID cannot be empty"
            ])
        }
        
        guard !applicantId.isEmpty else {
            throw NSError(domain: "ApplicationEntity", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Applicant ID cannot be empty"
            ])
        }
        
        guard monthlyIncome >= 0 else {
            throw NSError(domain: "ApplicationEntity", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Monthly income must be non-negative"
            ])
        }
    }
}