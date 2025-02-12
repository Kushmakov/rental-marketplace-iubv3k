import Foundation

/// Error type for property validation failures
public enum PropertyValidationError: Error {
    case invalidPrice
    case invalidCoordinates
    case missingRequiredFields
    case duplicateEntry
}

/// Represents the current status of a property
public enum PropertyStatus: String {
    case available
    case pending
    case rented
    case unavailable
}

/// Thread-safe domain model representing a property in the rental platform
public class Property {
    // MARK: - Properties
    
    public let id: String
    public let name: String
    public let propertyDescription: String
    public private(set) var price: Double
    public let bedrooms: Int
    public let bathrooms: Int
    public let squareFootage: Double
    public let address: String
    public let latitude: Double
    public let longitude: Double
    public let isPetFriendly: Bool
    public private(set) var status: PropertyStatus
    public let owner: User
    public let availableFrom: Date
    public let createdAt: Date
    public private(set) var updatedAt: Date
    
    // Thread-safe collections
    private let collectionLock = NSLock()
    private var _amenities: [String] = []
    public var amenities: [String] {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        return _amenities
    }
    
    private var _images: [String] = []
    public var images: [String] {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        return _images
    }
    
    private var _priceHistory: [PriceHistory] = []
    public var priceHistory: [PriceHistory] {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        return _priceHistory
    }
    
    // MARK: - Price History Struct
    
    private struct PriceHistory {
        let price: Double
        let timestamp: Date
    }
    
    // MARK: - Initialization
    
    /// Initialize a Property instance with required properties and validation
    public init(id: String,
                name: String,
                propertyDescription: String,
                price: Double,
                bedrooms: Int,
                bathrooms: Int,
                squareFootage: Double,
                address: String,
                latitude: Double,
                longitude: Double,
                isPetFriendly: Bool,
                status: PropertyStatus,
                owner: User,
                availableFrom: Date,
                createdAt: Date,
                updatedAt: Date) throws {
        
        // Validate price
        guard price > 0 else {
            throw PropertyValidationError.invalidPrice
        }
        
        // Validate coordinates
        guard latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 else {
            throw PropertyValidationError.invalidCoordinates
        }
        
        // Validate required fields
        guard !id.isEmpty && !name.isEmpty && !propertyDescription.isEmpty && !address.isEmpty else {
            throw PropertyValidationError.missingRequiredFields
        }
        
        self.id = id
        self.name = name
        self.propertyDescription = propertyDescription
        self.price = price
        self.bedrooms = bedrooms
        self.bathrooms = bathrooms
        self.squareFootage = squareFootage
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.isPetFriendly = isPetFriendly
        self.status = status
        self.owner = owner
        self.availableFrom = availableFrom
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        
        // Initialize price history
        _priceHistory.append(PriceHistory(price: price, timestamp: createdAt))
    }
    
    // MARK: - Public Methods
    
    /// Validate property data
    public func validate() -> Result<Void, PropertyValidationError> {
        // Validate price
        guard price > 0 else {
            return .failure(.invalidPrice)
        }
        
        // Validate coordinates
        guard latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 else {
            return .failure(.invalidCoordinates)
        }
        
        // Validate required fields
        guard !id.isEmpty && !name.isEmpty && !propertyDescription.isEmpty && !address.isEmpty else {
            return .failure(.missingRequiredFields)
        }
        
        return .success(())
    }
    
    /// Update property price with history tracking
    public func updatePrice(_ newPrice: Double) -> Result<Void, PropertyValidationError> {
        guard newPrice > 0 else {
            return .failure(.invalidPrice)
        }
        
        collectionLock.lock()
        defer { collectionLock.unlock() }
        
        price = newPrice
        updatedAt = Date()
        _priceHistory.append(PriceHistory(price: newPrice, timestamp: updatedAt))
        
        return .success(())
    }
    
    /// Update property status with validation
    public func updateStatus(_ newStatus: PropertyStatus) -> Result<Void, PropertyValidationError> {
        status = newStatus
        updatedAt = Date()
        return .success(())
    }
    
    /// Thread-safe addition of amenity
    public func addAmenity(_ amenity: String) -> Result<Void, PropertyValidationError> {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        
        guard !_amenities.contains(amenity) else {
            return .failure(.duplicateEntry)
        }
        
        _amenities.append(amenity)
        updatedAt = Date()
        return .success(())
    }
    
    /// Thread-safe removal of amenity
    public func removeAmenity(_ amenity: String) -> Result<Void, PropertyValidationError> {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        
        _amenities.removeAll { $0 == amenity }
        updatedAt = Date()
        return .success(())
    }
    
    /// Thread-safe addition of image URL
    public func addImage(_ imageUrl: String) -> Result<Void, PropertyValidationError> {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        
        guard !_images.contains(imageUrl) else {
            return .failure(.duplicateEntry)
        }
        
        guard URL(string: imageUrl) != nil else {
            return .failure(.invalidCoordinates)
        }
        
        _images.append(imageUrl)
        updatedAt = Date()
        return .success(())
    }
    
    /// Thread-safe removal of image URL
    public func removeImage(_ imageUrl: String) -> Result<Void, PropertyValidationError> {
        collectionLock.lock()
        defer { collectionLock.unlock() }
        
        _images.removeAll { $0 == imageUrl }
        updatedAt = Date()
        return .success(())
    }
}

// MARK: - Equatable
extension Property: Equatable {
    public static func == (lhs: Property, rhs: Property) -> Bool {
        return lhs.id == rhs.id
    }
}

// MARK: - Hashable
extension Property: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}