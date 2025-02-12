import Foundation

// MARK: - Payment Status Enum
enum PaymentStatus: String, Codable, CaseIterable {
    case pending
    case processing
    case completed
    case failed
    case refunded
    
    var isTerminal: Bool {
        switch self {
            case .completed, .failed, .refunded: return true
            default: return false
        }
    }
}

// MARK: - Payment Type Enum
enum PaymentType: String, Codable, CaseIterable {
    case rent
    case deposit
    case commission
    
    var requiresReceipt: Bool {
        switch self {
            case .rent, .deposit: return true
            case .commission: return false
        }
    }
}

// MARK: - Payment Validation Error
enum PaymentValidationError: Error {
    case invalidAmount
    case invalidCurrency
    case invalidStatus
    case invalidType
    case missingRequiredField
}

// MARK: - Payment Model
struct Payment: Codable, Equatable, Identifiable, Hashable {
    // MARK: - Properties
    let id: String
    let amount: Decimal
    let currency: String
    var status: PaymentStatus
    let type: PaymentType
    let applicationId: String
    let userId: String
    let propertyId: String
    let createdAt: Date
    var updatedAt: Date
    var description: String?
    var metadata: [String: String]?
    
    // MARK: - Computed Properties
    var formattedAmount: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "\(currency) \(amount)"
    }
    
    var isRefundable: Bool {
        return status == .completed && 
               type != .commission &&
               Date().timeIntervalSince(createdAt) < (30 * 24 * 60 * 60) // 30 days
    }
    
    // MARK: - Initialization
    init(id: String,
         amount: Decimal,
         currency: String,
         status: PaymentStatus,
         type: PaymentType,
         applicationId: String,
         userId: String,
         propertyId: String,
         createdAt: Date = Date(),
         updatedAt: Date = Date(),
         description: String? = nil,
         metadata: [String: String]? = nil) {
        self.id = id
        self.amount = amount
        self.currency = currency
        self.status = status
        self.type = type
        self.applicationId = applicationId
        self.userId = userId
        self.propertyId = propertyId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.description = description
        self.metadata = metadata
    }
    
    // MARK: - Validation
    func validate() throws {
        // Validate required fields
        guard !id.isEmpty else { throw PaymentValidationError.missingRequiredField }
        guard !applicationId.isEmpty else { throw PaymentValidationError.missingRequiredField }
        guard !userId.isEmpty else { throw PaymentValidationError.missingRequiredField }
        guard !propertyId.isEmpty else { throw PaymentValidationError.missingRequiredField }
        
        // Validate amount
        guard amount > 0 else { throw PaymentValidationError.invalidAmount }
        
        // Validate currency (ISO 4217 currency code format)
        let currencyRegex = "^[A-Z]{3}$"
        guard currency.range(of: currencyRegex, options: .regularExpression) != nil else {
            throw PaymentValidationError.invalidCurrency
        }
    }
    
    // MARK: - Hashable
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
    
    // MARK: - Equatable
    static func == (lhs: Payment, rhs: Payment) -> Bool {
        return lhs.id == rhs.id &&
               lhs.amount == rhs.amount &&
               lhs.currency == rhs.currency &&
               lhs.status == rhs.status &&
               lhs.type == rhs.type &&
               lhs.applicationId == rhs.applicationId &&
               lhs.userId == rhs.userId &&
               lhs.propertyId == rhs.propertyId &&
               lhs.createdAt == rhs.createdAt &&
               lhs.updatedAt == rhs.updatedAt &&
               lhs.description == rhs.description &&
               lhs.metadata == rhs.metadata
    }
}