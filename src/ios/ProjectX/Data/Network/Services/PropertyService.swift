//
// PropertyService.swift
// ProjectX
//
// Network service handling property-related API operations with comprehensive monitoring and caching
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
//

import Foundation
import Combine

/// Configuration options for PropertyService
public struct PropertyServiceConfiguration {
    let cacheTimeoutInterval: TimeInterval
    let maxCacheSize: Int
    let requestPriority: Operation.QueuePriority
    let enableMetrics: Bool
    
    public static let `default` = PropertyServiceConfiguration(
        cacheTimeoutInterval: 300, // 5 minutes
        maxCacheSize: 100,         // Maximum 100 properties in cache
        requestPriority: .normal,
        enableMetrics: true
    )
}

/// Thread-safe service class handling property-related network operations
public final class PropertyService {
    
    // MARK: - Properties
    
    private let apiClient: APIClient
    private let propertyCache: NSCache<NSString, Property>
    private let requestQueue: DispatchQueue
    private let configuration: PropertyServiceConfiguration
    private let monitor: PropertyServiceMonitor
    
    // MARK: - Initialization
    
    /// Initializes PropertyService with configuration
    /// - Parameter configuration: Service configuration options
    public init(configuration: PropertyServiceConfiguration = .default) {
        self.apiClient = .shared
        self.configuration = configuration
        
        // Initialize property cache with size limits
        self.propertyCache = NSCache<NSString, Property>()
        propertyCache.countLimit = configuration.maxCacheSize
        
        // Initialize dedicated serial queue for request handling
        self.requestQueue = DispatchQueue(
            label: "com.projectx.propertyservice",
            qos: .userInitiated
        )
        
        // Initialize performance monitoring
        self.monitor = PropertyServiceMonitor(enableMetrics: configuration.enableMetrics)
    }
    
    // MARK: - Public Methods
    
    /// Searches for properties with given criteria and monitoring
    /// - Parameters:
    ///   - location: Optional location search string
    ///   - minPrice: Optional minimum price filter
    ///   - maxPrice: Optional maximum price filter
    ///   - bedrooms: Optional number of bedrooms filter
    ///   - petFriendly: Optional pet-friendly filter
    /// - Returns: Publisher emitting array of properties or error
    public func searchProperties(
        location: String? = nil,
        minPrice: Double? = nil,
        maxPrice: Double? = nil,
        bedrooms: Int? = nil,
        petFriendly: Bool? = nil
    ) -> AnyPublisher<[Property], APIError> {
        
        // Start request monitoring
        let requestId = UUID().uuidString
        monitor.trackRequestStart(requestId)
        
        // Construct search parameters
        var queryParams: [String: String] = [:]
        if let location = location { queryParams["location"] = location }
        if let minPrice = minPrice { queryParams["min_price"] = String(minPrice) }
        if let maxPrice = maxPrice { queryParams["max_price"] = String(maxPrice) }
        if let bedrooms = bedrooms { queryParams["bedrooms"] = String(bedrooms) }
        if let petFriendly = petFriendly { queryParams["pet_friendly"] = String(petFriendly) }
        
        // Generate cache key from parameters
        let cacheKey = generateCacheKey(params: queryParams)
        
        // Check cache first
        if let cachedProperties = propertyCache.object(forKey: cacheKey as NSString) {
            monitor.trackCacheHit(requestId)
            return Just([cachedProperties])
                .setFailureType(to: APIError.self)
                .eraseToAnyPublisher()
        }
        
        // Prepare API request
        return requestQueue.async { [weak self] in
            guard let self = self else {
                return Fail(error: APIError.custom("Service deallocated"))
                    .eraseToAnyPublisher()
            }
            
            // Make API request through client
            return self.apiClient.request(
                .properties.search,
                parameters: queryParams,
                priority: self.configuration.requestPriority
            )
            .map { (response: [Property]) -> [Property] in
                // Update cache with new results
                response.forEach { property in
                    self.propertyCache.setObject(
                        property,
                        forKey: property.id as NSString
                    )
                }
                
                // Track successful response
                self.monitor.trackRequestSuccess(requestId)
                return response
            }
            .catch { error -> AnyPublisher<[Property], APIError> in
                // Track request failure
                self.monitor.trackRequestFailure(requestId, error: error)
                return Fail(error: error).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
        }
    }
    
    /// Retrieves detailed property information by ID
    /// - Parameter id: Property identifier
    /// - Returns: Publisher emitting property details or error
    public func getPropertyDetails(id: String) -> AnyPublisher<Property, APIError> {
        let requestId = UUID().uuidString
        monitor.trackRequestStart(requestId)
        
        // Check cache first
        if let cachedProperty = propertyCache.object(forKey: id as NSString) {
            monitor.trackCacheHit(requestId)
            return Just(cachedProperty)
                .setFailureType(to: APIError.self)
                .eraseToAnyPublisher()
        }
        
        return requestQueue.async { [weak self] in
            guard let self = self else {
                return Fail(error: APIError.custom("Service deallocated"))
                    .eraseToAnyPublisher()
            }
            
            return self.apiClient.request(
                .properties.details,
                parameters: ["id": id],
                priority: self.configuration.requestPriority
            )
            .map { (property: Property) -> Property in
                // Update cache with fetched property
                self.propertyCache.setObject(property, forKey: id as NSString)
                self.monitor.trackRequestSuccess(requestId)
                return property
            }
            .catch { error -> AnyPublisher<Property, APIError> in
                self.monitor.trackRequestFailure(requestId, error: error)
                return Fail(error: error).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
        }
    }
    
    // MARK: - Private Helpers
    
    private func generateCacheKey(params: [String: String]) -> String {
        let sortedKeys = params.keys.sorted()
        return sortedKeys.map { "\($0)=\(params[$0] ?? "")" }.joined(separator: "&")
    }
}

// MARK: - Monitoring

private final class PropertyServiceMonitor {
    private let enableMetrics: Bool
    private var metrics: [String: Any] = [:]
    private let metricsQueue = DispatchQueue(label: "com.projectx.propertyservice.metrics")
    
    init(enableMetrics: Bool) {
        self.enableMetrics = enableMetrics
    }
    
    func trackRequestStart(_ requestId: String) {
        guard enableMetrics else { return }
        metricsQueue.async {
            self.metrics[requestId] = Date()
        }
    }
    
    func trackRequestSuccess(_ requestId: String) {
        guard enableMetrics else { return }
        metricsQueue.async {
            if let startTime = self.metrics[requestId] as? Date {
                let duration = Date().timeIntervalSince(startTime)
                NotificationCenter.default.post(
                    name: .propertyServiceMetric,
                    object: nil,
                    userInfo: [
                        "requestId": requestId,
                        "duration": duration,
                        "success": true
                    ]
                )
            }
            self.metrics.removeValue(forKey: requestId)
        }
    }
    
    func trackRequestFailure(_ requestId: String, error: APIError) {
        guard enableMetrics else { return }
        metricsQueue.async {
            if let startTime = self.metrics[requestId] as? Date {
                let duration = Date().timeIntervalSince(startTime)
                NotificationCenter.default.post(
                    name: .propertyServiceMetric,
                    object: nil,
                    userInfo: [
                        "requestId": requestId,
                        "duration": duration,
                        "success": false,
                        "error": error
                    ]
                )
            }
            self.metrics.removeValue(forKey: requestId)
        }
    }
    
    func trackCacheHit(_ requestId: String) {
        guard enableMetrics else { return }
        metricsQueue.async {
            NotificationCenter.default.post(
                name: .propertyServiceMetric,
                object: nil,
                userInfo: [
                    "requestId": requestId,
                    "cacheHit": true
                ]
            )
        }
    }
}

// MARK: - Notification Extension

extension Notification.Name {
    static let propertyServiceMetric = Notification.Name("com.projectx.propertyservice.metric")
}