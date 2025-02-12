import CoreData
import Foundation

/// Core Data managed object subclass representing a property entity with comprehensive validation and relationship management
/// Version: iOS SDK 14.0+
@objc(PropertyEntity)
@objcMembers
public class PropertyEntity: NSManagedObject {
    
    // MARK: - Properties
    @NSManaged public var id: String
    @NSManaged public var name: String
    @NSManaged public var propertyDescription: String
    @NSManaged public var price: Double
    @NSManaged public var bedrooms: Int16
    @NSManaged public var bathrooms: Int16
    @NSManaged public var squareFootage: Double
    @NSManaged public var address: String
    @NSManaged public var latitude: Double
    @NSManaged public var longitude: Double
    @NSManaged public var isPetFriendly: Bool
    @NSManaged public var status: String
    @NSManaged public var amenities: NSSet
    @NSManaged public var images: NSSet
    @NSManaged public var owner: UserEntity
    @NSManaged public var applications: NSSet
    @NSManaged public var availableFrom: Date
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date
    
    // Thread safety locks
    private let amenitiesLock = NSLock()
    private let imagesLock = NSLock()
    private let applicationsLock = NSLock()
    
    // MARK: - Constants
    private enum Constants {
        static let minPrice: Double = 100.0
        static let maxPrice: Double = 1000000.0
        static let validStatuses = ["available", "pending", "rented", "maintenance"]
        static let minLatitude: Double = -90.0
        static let maxLatitude: Double = 90.0
        static let minLongitude: Double = -180.0
        static let maxLongitude: Double = 180.0
    }
    
    // MARK: - Initialization
    public override init(entity: NSEntityDescription, insertInto context: NSManagedObjectContext?) {
        super.init(entity: entity, insertInto: context)
        
        // Initialize default values
        self.id = UUID().uuidString
        self.createdAt = Date()
        self.updatedAt = Date()
        self.status = "available"
        self.amenities = NSSet()
        self.images = NSSet()
        self.applications = NSSet()
        
        // Set up KVO for monitoring changes
        addObserver(self, forKeyPath: "price", options: .new, context: nil)
        addObserver(self, forKeyPath: "status", options: .new, context: nil)
    }
    
    deinit {
        removeObserver(self, forKeyPath: "price")
        removeObserver(self, forKeyPath: "status")
    }
    
    // MARK: - KVO
    public override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        guard let keyPath = keyPath else { return }
        
        switch keyPath {
        case "price":
            if let newPrice = change?[.newKey] as? Double {
                _ = validatePrice(newPrice)
            }
        case "status":
            if let newStatus = change?[.newKey] as? String {
                validateStatus(newStatus)
            }
        default:
            super.observeValue(forKeyPath: keyPath, of: object, change: change, context: context)
        }
    }
    
    // MARK: - Validation Methods
    
    /// Validates property price within acceptable range
    /// - Parameter price: Price to validate
    /// - Returns: True if price is valid
    public func validatePrice(_ price: Double) -> Bool {
        let isValid = price >= Constants.minPrice && price <= Constants.maxPrice
        
        if !isValid {
            NotificationCenter.default.post(
                name: NSNotification.Name("PropertyPriceValidationFailed"),
                object: self,
                userInfo: ["price": price]
            )
        }
        
        return isValid
    }
    
    /// Validates property coordinates
    /// - Parameters:
    ///   - latitude: Latitude to validate
    ///   - longitude: Longitude to validate
    /// - Returns: True if coordinates are valid
    public func validateLocation(_ latitude: Double, _ longitude: Double) -> Bool {
        let isValidLatitude = latitude >= Constants.minLatitude && latitude <= Constants.maxLatitude
        let isValidLongitude = longitude >= Constants.minLongitude && longitude <= Constants.maxLongitude
        
        let isValid = isValidLatitude && isValidLongitude
        
        if !isValid {
            NotificationCenter.default.post(
                name: NSNotification.Name("PropertyLocationValidationFailed"),
                object: self,
                userInfo: ["latitude": latitude, "longitude": longitude]
            )
        }
        
        return isValid
    }
    
    private func validateStatus(_ status: String) {
        guard Constants.validStatuses.contains(status) else {
            assertionFailure("Invalid property status: \(status)")
            return
        }
    }
    
    // MARK: - Thread-Safe Collection Management
    
    /// Thread-safe addition of amenity
    /// - Parameter amenity: Amenity string to add
    public func addToAmenities(_ amenity: String) {
        amenitiesLock.lock()
        defer { amenitiesLock.unlock() }
        
        guard !amenity.isEmpty else { return }
        
        willChangeValue(forKey: "amenities")
        let mutableAmenities = NSMutableSet(set: amenities)
        mutableAmenities.add(amenity)
        amenities = mutableAmenities as NSSet
        didChangeValue(forKey: "amenities")
        
        updatedAt = Date()
    }
    
    /// Thread-safe removal of amenity
    /// - Parameter amenity: Amenity string to remove
    public func removeFromAmenities(_ amenity: String) {
        amenitiesLock.lock()
        defer { amenitiesLock.unlock() }
        
        willChangeValue(forKey: "amenities")
        let mutableAmenities = NSMutableSet(set: amenities)
        mutableAmenities.remove(amenity)
        amenities = mutableAmenities as NSSet
        didChangeValue(forKey: "amenities")
        
        updatedAt = Date()
    }
    
    /// Thread-safe addition of image URL
    /// - Parameter imageUrl: Image URL to add
    public func addToImages(_ imageUrl: String) {
        imagesLock.lock()
        defer { imagesLock.unlock() }
        
        guard URL(string: imageUrl) != nil else { return }
        
        willChangeValue(forKey: "images")
        let mutableImages = NSMutableSet(set: images)
        mutableImages.add(imageUrl)
        images = mutableImages as NSSet
        didChangeValue(forKey: "images")
        
        updatedAt = Date()
    }
    
    /// Thread-safe addition of application with validation
    /// - Parameter application: ApplicationEntity to add
    public func addToApplications(_ application: ApplicationEntity) {
        applicationsLock.lock()
        defer { applicationsLock.unlock() }
        
        guard status == "available" else { return }
        
        willChangeValue(forKey: "applications")
        let mutableApplications = NSMutableSet(set: applications)
        mutableApplications.add(application)
        applications = mutableApplications as NSSet
        didChangeValue(forKey: "applications")
        
        // Set inverse relationship
        application.propertyId = self.id
        
        updatedAt = Date()
        
        NotificationCenter.default.post(
            name: NSNotification.Name("PropertyApplicationAdded"),
            object: self,
            userInfo: ["applicationId": application.id]
        )
    }
}

// MARK: - Validation
extension PropertyEntity {
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
            throw NSError(domain: "PropertyEntity", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Property ID cannot be empty"
            ])
        }
        
        guard !name.isEmpty else {
            throw NSError(domain: "PropertyEntity", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Property name cannot be empty"
            ])
        }
        
        guard validatePrice(price) else {
            throw NSError(domain: "PropertyEntity", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Invalid property price"
            ])
        }
        
        guard validateLocation(latitude, longitude) else {
            throw NSError(domain: "PropertyEntity", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Invalid property location"
            ])
        }
        
        guard !address.isEmpty else {
            throw NSError(domain: "PropertyEntity", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Property address cannot be empty"
            ])
        }
        
        guard Constants.validStatuses.contains(status) else {
            throw NSError(domain: "PropertyEntity", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "Invalid property status"
            ])
        }
    }
}