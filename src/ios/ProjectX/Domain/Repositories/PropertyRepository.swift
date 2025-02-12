//
// PropertyRepository.swift
// ProjectX
//
// Repository coordinating property data operations with advanced caching and monitoring
// Foundation version: iOS 14.0+
// Combine version: iOS 14.0+
//

import Foundation
import CoreData
import Combine

/// Thread-safe repository managing property data operations with advanced caching and monitoring
public final class PropertyRepository {
    
    // MARK: - Properties
    
    private let propertyService: PropertyService
    private let coreDataManager: CoreDataManager
    private let memoryCache: NSCache<NSString, Property>
    private let backgroundQueue: OperationQueue
    private let metricsTracker: PropertyMetricsTracker?
    private let cacheTTL: TimeInterval
    
    private let cacheQueue = DispatchQueue(label: "com.projectx.propertyrepository.cache")
    
    // MARK: - Constants
    
    private enum Constants {
        static let defaultCacheTTL: TimeInterval = 300 // 5 minutes
        static let maxMemoryCacheSize = 100 // Maximum properties in memory
        static let prefetchBatchSize = 10
    }
    
    // MARK: - Initialization
    
    /// Initializes PropertyRepository with enhanced configuration
    /// - Parameters:
    ///   - propertyService: Service for remote API operations
    ///   - cacheTTL: Time-to-live for cached data
    ///   - metricsTracker: Optional performance metrics tracker
    public init(
        propertyService: PropertyService,
        cacheTTL: TimeInterval = Constants.defaultCacheTTL,
        metricsTracker: PropertyMetricsTracker? = nil
    ) {
        self.propertyService = propertyService
        self.coreDataManager = .shared
        self.cacheTTL = cacheTTL
        self.metricsTracker = metricsTracker
        
        // Initialize memory cache with size limits
        self.memoryCache = NSCache<NSString, Property>()
        memoryCache.countLimit = Constants.maxMemoryCacheSize
        
        // Configure background operation queue
        self.backgroundQueue = OperationQueue()
        backgroundQueue.maxConcurrentOperationCount = 1
        backgroundQueue.qualityOfService = .utility
        
        // Register for memory warning notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Searches for properties with advanced caching and prefetching
    /// - Parameters:
    ///   - location: Optional location filter
    ///   - minPrice: Optional minimum price filter
    ///   - maxPrice: Optional maximum price filter
    ///   - bedrooms: Optional bedrooms filter
    ///   - petFriendly: Optional pet-friendly filter
    /// - Returns: Publisher emitting array of properties or error
    public func searchProperties(
        location: String? = nil,
        minPrice: Double? = nil,
        maxPrice: Double? = nil,
        bedrooms: Int? = nil,
        petFriendly: Bool? = nil
    ) -> AnyPublisher<[Property], Error> {
        let requestId = UUID().uuidString
        metricsTracker?.trackRequestStart(requestId)
        
        // Generate cache key from search parameters
        let cacheKey = generateCacheKey(
            location: location,
            minPrice: minPrice,
            maxPrice: maxPrice,
            bedrooms: bedrooms,
            petFriendly: petFriendly
        )
        
        // Check memory cache first
        if let cachedResult = checkMemoryCache(forKey: cacheKey) {
            metricsTracker?.trackCacheHit(requestId)
            return Just(cachedResult)
                .setFailureType(to: Error.self)
                .eraseToAnyPublisher()
        }
        
        // Check persistent store
        return checkPersistentStore(forKey: cacheKey)
            .catch { [weak self] _ -> AnyPublisher<[Property], Error> in
                guard let self = self else {
                    return Fail(error: APIError.custom("Repository deallocated"))
                        .eraseToAnyPublisher()
                }
                
                // Fetch from remote API if cache miss
                return self.propertyService.searchProperties(
                    location: location,
                    minPrice: minPrice,
                    maxPrice: maxPrice,
                    bedrooms: bedrooms,
                    petFriendly: petFriendly
                )
                .mapError { $0 as Error }
                .flatMap { [weak self] properties -> AnyPublisher<[Property], Error> in
                    guard let self = self else {
                        return Fail(error: APIError.custom("Repository deallocated"))
                            .eraseToAnyPublisher()
                    }
                    
                    // Update caches with new data
                    self.updateCaches(properties: properties, cacheKey: cacheKey)
                    
                    // Trigger background prefetch for related properties
                    self.prefetchRelatedProperties(properties: properties)
                    
                    return Just(properties)
                        .setFailureType(to: Error.self)
                        .eraseToAnyPublisher()
                }
                .handleEvents(
                    receiveOutput: { [weak self] _ in
                        self?.metricsTracker?.trackRequestSuccess(requestId)
                    },
                    receiveCompletion: { [weak self] completion in
                        if case .failure(let error) = completion {
                            self?.metricsTracker?.trackRequestFailure(requestId, error: error)
                        }
                    }
                )
                .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
    
    /// Retrieves detailed property information with caching
    /// - Parameter id: Property identifier
    /// - Returns: Publisher emitting property details or error
    public func getPropertyDetails(id: String) -> AnyPublisher<Property, Error> {
        let requestId = UUID().uuidString
        metricsTracker?.trackRequestStart(requestId)
        
        // Check memory cache first
        if let cachedProperty = memoryCache.object(forKey: id as NSString) {
            metricsTracker?.trackCacheHit(requestId)
            return Just(cachedProperty)
                .setFailureType(to: Error.self)
                .eraseToAnyPublisher()
        }
        
        // Fetch from persistent store or remote
        return propertyService.getPropertyDetails(id: id)
            .mapError { $0 as Error }
            .flatMap { [weak self] property -> AnyPublisher<Property, Error> in
                guard let self = self else {
                    return Fail(error: APIError.custom("Repository deallocated"))
                        .eraseToAnyPublisher()
                }
                
                // Update caches
                self.updateCaches(properties: [property], cacheKey: id)
                
                return Just(property)
                    .setFailureType(to: Error.self)
                    .eraseToAnyPublisher()
            }
            .handleEvents(
                receiveOutput: { [weak self] _ in
                    self?.metricsTracker?.trackRequestSuccess(requestId)
                },
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.metricsTracker?.trackRequestFailure(requestId, error: error)
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    /// Clears all cached property data
    public func clearCache() {
        cacheQueue.async { [weak self] in
            self?.memoryCache.removeAllObjects()
            self?.coreDataManager.clearStorage()
        }
    }
    
    // MARK: - Private Methods
    
    private func generateCacheKey(
        location: String?,
        minPrice: Double?,
        maxPrice: Double?,
        bedrooms: Int?,
        petFriendly: Bool?
    ) -> String {
        return [
            location ?? "",
            minPrice.map { String($0) } ?? "",
            maxPrice.map { String($0) } ?? "",
            bedrooms.map { String($0) } ?? "",
            petFriendly.map { String($0) } ?? ""
        ].joined(separator: "-")
    }
    
    private func checkMemoryCache(forKey key: String) -> [Property]? {
        return cacheQueue.sync {
            guard let properties = memoryCache.object(forKey: key as NSString) else {
                return nil
            }
            return [properties]
        }
    }
    
    private func checkPersistentStore(forKey key: String) -> AnyPublisher<[Property], Error> {
        return Future { [weak self] promise in
            self?.coreDataManager.performBackgroundTask { context in
                let fetchRequest: NSFetchRequest<PropertyEntity> = PropertyEntity.fetchRequest()
                fetchRequest.predicate = NSPredicate(format: "cacheKey == %@", key)
                
                do {
                    let entities = try context.fetch(fetchRequest)
                    let properties = entities.compactMap { Property.fromEntity($0) }
                    promise(.success(properties))
                } catch {
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    private func updateCaches(properties: [Property], cacheKey: String) {
        cacheQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Update memory cache
            properties.forEach { property in
                self.memoryCache.setObject(property, forKey: property.id as NSString)
            }
            
            // Update persistent store
            self.coreDataManager.performBackgroundTask { context in
                properties.forEach { property in
                    let entity = property.toEntity(in: context)
                    entity.cacheKey = cacheKey
                    entity.lastUpdated = Date()
                }
                
                _ = self.coreDataManager.saveContext(context)
            }
        }
    }
    
    private func prefetchRelatedProperties(properties: [Property]) {
        backgroundQueue.addOperation { [weak self] in
            guard let self = self else { return }
            
            let relatedIds = properties.prefix(Constants.prefetchBatchSize).map { $0.id }
            
            self.propertyService.batchFetch(ids: relatedIds)
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { [weak self] relatedProperties in
                        self?.updateCaches(
                            properties: relatedProperties,
                            cacheKey: "prefetch"
                        )
                    }
                )
                .store(in: &Set<AnyCancellable>())
        }
    }
    
    @objc private func handleMemoryWarning() {
        clearCache()
    }
}

// MARK: - PropertyMetricsTracker

/// Protocol for tracking property repository performance metrics
public protocol PropertyMetricsTracker {
    func trackRequestStart(_ requestId: String)
    func trackRequestSuccess(_ requestId: String)
    func trackRequestFailure(_ requestId: String, error: Error)
    func trackCacheHit(_ requestId: String)
}