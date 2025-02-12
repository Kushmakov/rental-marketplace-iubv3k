import Foundation
import CryptoKit

/// Error type for application validation failures
public enum ApplicationError: Error {
    case invalidIncome
    case invalidEmploymentStatus
    case invalidAddress
    case invalidCreditScore
    case invalidStatus
    case documentError
    case encryptionError
    case concurrencyError
}

/// Thread-safe domain model representing a rental application
public class Application {
    // MARK: - Properties
    
    public let id: String
    private(set) var status: String {
        didSet {
            updateTimestamp()
        }
    }
    private(set) var monthlyIncome: Double
    private(set) var employmentStatus: String
    private let encryptedAddress: Data
    private(set) var creditScore: String
    
    public let applicant: User
    public let property: Property
    public let submittedAt: Date
    private(set) var updatedAt: Date
    
    // Thread safety locks
    private let documentLock = NSLock()
    private let statusLock = NSLock()
    private var _documents: [String] = []
    
    public var documents: [String] {
        documentLock.lock()
        defer { documentLock.unlock() }
        return _documents
    }
    
    private var notes: String = ""
    
    // MARK: - Constants
    
    private enum Constants {
        static let validStatuses = ["draft", "submitted", "under_review", "approved", "rejected"]
        static let validEmploymentStatuses = ["employed", "self_employed", "unemployed", "student"]
        static let minimumIncome: Double = 0.0
        static let minimumCreditScore = "300"
        static let maximumCreditScore = "850"
    }
    
    // MARK: - Initialization
    
    /// Initialize a thread-safe Application instance with required properties and encryption
    /// - Parameters:
    ///   - id: Unique identifier for the application
    ///   - status: Current application status
    ///   - monthlyIncome: Applicant's monthly income
    ///   - employmentStatus: Current employment status
    ///   - currentAddress: Applicant's current address (will be encrypted)
    ///   - creditScore: Applicant's credit score
    ///   - applicant: Associated User instance
    ///   - property: Associated Property instance
    ///   - submittedAt: Initial submission timestamp
    ///   - updatedAt: Last update timestamp
    /// - Throws: ApplicationError if validation fails
    public init(id: String,
                status: String,
                monthlyIncome: Double,
                employmentStatus: String,
                currentAddress: String,
                creditScore: String,
                applicant: User,
                property: Property,
                submittedAt: Date,
                updatedAt: Date) throws {
        
        // Validate status
        guard Constants.validStatuses.contains(status) else {
            throw ApplicationError.invalidStatus
        }
        
        // Validate monthly income
        guard monthlyIncome >= Constants.minimumIncome else {
            throw ApplicationError.invalidIncome
        }
        
        // Validate employment status
        guard Constants.validEmploymentStatuses.contains(employmentStatus) else {
            throw ApplicationError.invalidEmploymentStatus
        }
        
        // Validate credit score
        guard let score = Int(creditScore),
              score >= Int(Constants.minimumCreditScore) ?? 300,
              score <= Int(Constants.maximumCreditScore) ?? 850 else {
            throw ApplicationError.invalidCreditScore
        }
        
        // Encrypt address
        do {
            let addressData = currentAddress.data(using: .utf8) ?? Data()
            let key = SymmetricKey(size: .bits256)
            let sealedBox = try AES.GCM.seal(addressData, using: key)
            self.encryptedAddress = sealedBox.combined ?? Data()
        } catch {
            throw ApplicationError.encryptionError
        }
        
        self.id = id
        self.status = status
        self.monthlyIncome = monthlyIncome
        self.employmentStatus = employmentStatus
        self.creditScore = creditScore
        self.applicant = applicant
        self.property = property
        self.submittedAt = submittedAt
        self.updatedAt = updatedAt
    }
    
    // MARK: - Public Methods
    
    /// Thread-safe document addition with validation
    /// - Parameter documentUrl: URL of the document to add
    /// - Returns: Result indicating success or failure
    public func addDocument(_ documentUrl: String) -> Result<Void, ApplicationError> {
        guard URL(string: documentUrl) != nil else {
            return .failure(.documentError)
        }
        
        documentLock.lock()
        defer { documentLock.unlock() }
        
        guard !_documents.contains(documentUrl) else {
            return .failure(.documentError)
        }
        
        _documents.append(documentUrl)
        updateTimestamp()
        
        return .success(())
    }
    
    /// Thread-safe status update with validation
    /// - Parameter newStatus: New status to set
    /// - Returns: Result indicating success or failure
    public func updateStatus(_ newStatus: String) -> Result<Void, ApplicationError> {
        guard Constants.validStatuses.contains(newStatus) else {
            return .failure(.invalidStatus)
        }
        
        statusLock.lock()
        defer { statusLock.unlock() }
        
        status = newStatus
        updateTimestamp()
        
        return .success(())
    }
    
    /// Convert Application model to ApplicationEntity for Core Data persistence
    /// - Parameter context: NSManagedObjectContext for entity creation
    /// - Returns: ApplicationEntity instance
    public func toEntity(in context: NSManagedObjectContext) -> ApplicationEntity {
        let entity = ApplicationEntity(entity: ApplicationEntity.entity(), insertInto: context)
        entity.id = id
        entity.status = status
        entity.monthlyIncome = monthlyIncome
        entity.employmentStatus = employmentStatus
        entity.creditScore = creditScore
        entity.encryptedData = encryptedAddress
        entity.documents = NSSet(array: documents)
        entity.notes = notes
        entity.applicantId = applicant.id
        entity.propertyId = property.id
        entity.submittedAt = submittedAt
        entity.updatedAt = updatedAt
        return entity
    }
    
    /// Create Application model from ApplicationEntity
    /// - Parameter entity: ApplicationEntity to convert
    /// - Returns: Application instance
    public static func fromEntity(_ entity: ApplicationEntity) throws -> Application {
        guard let applicant = try? User(id: entity.applicantId,
                                      email: "", // Fetch from User repository
                                      name: "",  // Fetch from User repository
                                      phone: "", // Fetch from User repository
                                      createdAt: Date(),
                                      updatedAt: Date()),
              let property = try? Property(id: entity.propertyId,
                                         name: "", // Fetch from Property repository
                                         propertyDescription: "",
                                         price: 0,
                                         bedrooms: 0,
                                         bathrooms: 0,
                                         squareFootage: 0,
                                         address: "",
                                         latitude: 0,
                                         longitude: 0,
                                         isPetFriendly: false,
                                         status: .available,
                                         owner: applicant,
                                         availableFrom: Date(),
                                         createdAt: Date(),
                                         updatedAt: Date()) else {
            throw ApplicationError.invalidStatus
        }
        
        let application = try Application(
            id: entity.id,
            status: entity.status,
            monthlyIncome: entity.monthlyIncome,
            employmentStatus: entity.employmentStatus,
            currentAddress: "", // Address is encrypted in entity
            creditScore: entity.creditScore,
            applicant: applicant,
            property: property,
            submittedAt: entity.submittedAt,
            updatedAt: entity.updatedAt
        )
        
        // Add documents
        if let documents = entity.documents as? Set<String> {
            documents.forEach { _ = application.addDocument($0) }
        }
        
        return application
    }
    
    // MARK: - Private Methods
    
    private func updateTimestamp() {
        updatedAt = Date()
    }
}

// MARK: - Equatable
extension Application: Equatable {
    public static func == (lhs: Application, rhs: Application) -> Bool {
        return lhs.id == rhs.id
    }
}

// MARK: - Hashable
extension Application: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}