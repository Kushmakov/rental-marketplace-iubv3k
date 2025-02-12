import Foundation
import Combine  // iOS SDK 14.0+
import DatadogCore  // v1.0.0

/// ViewModel implementing dashboard screen business logic with optimized performance and caching
final class DashboardViewModel: ViewModelType {
    
    // MARK: - Types
    
    /// Input events for dashboard view model
    struct Input {
        let viewDidLoad: PassthroughSubject<Void, Never>
        let refresh: PassthroughSubject<Void, Never>
        let propertySelected: PassthroughSubject<String, Never>
        let prefetchTrigger: PassthroughSubject<Void, Never>
    }
    
    /// Output events from dashboard view model
    struct Output {
        let properties: AnyPublisher<[Property], Error>
        let statistics: AnyPublisher<DashboardStats, Error>
        let isLoading: AnyPublisher<Bool, Never>
        let error: AnyPublisher<Error?, Never>
        let cacheStatus: AnyPublisher<CacheStatus, Never>
    }
    
    /// Dashboard statistics model
    struct DashboardStats {
        let totalProperties: Int
        let activeListings: Int
        let pendingApplications: Int
        let totalRevenue: Double
    }
    
    /// Cache status for monitoring
    enum CacheStatus {
        case fresh
        case stale
        case updating
    }
    
    // MARK: - Properties
    
    private let propertyRepository: PropertyRepository
    private var cancellables = Set<AnyCancellable>()
    private let propertyCache = NSCache<NSString, NSArray>()
    private let backgroundQueue = DispatchQueue(
        label: "com.projectx.dashboard.background",
        qos: .userInitiated
    )
    
    private let monitor = DatadogCore.Monitor(
        configuration: .init(
            sampleRate: 0.1,
            serviceName: "ios-dashboard"
        )
    )
    
    // MARK: - Initialization
    
    init(propertyRepository: PropertyRepository) {
        self.propertyRepository = propertyRepository
        
        // Configure cache limits
        propertyCache.countLimit = 100
        propertyCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }
    
    // MARK: - ViewModelType
    
    func transform(_ input: Input) -> AnyPublisher<Output, Never> {
        let loadingSubject = CurrentValueSubject<Bool, Never>(false)
        let errorSubject = CurrentValueSubject<Error?, Never>(nil)
        let cacheStatusSubject = CurrentValueSubject<CacheStatus, Never>(.fresh)
        
        // Handle initial load
        let initialLoad = input.viewDidLoad
            .flatMap { [weak self] _ -> AnyPublisher<[Property], Error> in
                guard let self = self else {
                    return Fail(error: APIError.custom("ViewModel deallocated"))
                        .eraseToAnyPublisher()
                }
                return self.loadProperties(forceReload: false)
            }
            .share()
        
        // Handle refresh
        let refreshLoad = input.refresh
            .flatMap { [weak self] _ -> AnyPublisher<[Property], Error> in
                guard let self = self else {
                    return Fail(error: APIError.custom("ViewModel deallocated"))
                        .eraseToAnyPublisher()
                }
                return self.loadProperties(forceReload: true)
            }
            .share()
        
        // Combine property loads
        let properties = Publishers.Merge(initialLoad, refreshLoad)
            .handleEvents(
                receiveSubscription: { _ in loadingSubject.send(true) },
                receiveOutput: { [weak self] properties in
                    loadingSubject.send(false)
                    self?.prefetchPropertyDetails(properties: properties)
                },
                receiveCompletion: { completion in
                    loadingSubject.send(false)
                    if case .failure(let error) = completion {
                        errorSubject.send(error)
                    }
                }
            )
            .catch { error -> AnyPublisher<[Property], Error> in
                errorSubject.send(error)
                return Empty().eraseToAnyPublisher()
            }
            .share()
            .eraseToAnyPublisher()
        
        // Calculate dashboard statistics
        let statistics = properties
            .map { [weak self] properties -> DashboardStats in
                self?.monitor.track(name: "dashboard_stats_calculation")
                return self?.calculateStats(from: properties) ?? DashboardStats(
                    totalProperties: 0,
                    activeListings: 0,
                    pendingApplications: 0,
                    totalRevenue: 0
                )
            }
            .eraseToAnyPublisher()
        
        // Handle property selection with prefetching
        input.propertySelected
            .sink { [weak self] propertyId in
                self?.backgroundQueue.async {
                    self?.propertyRepository.getPropertyDetails(id: propertyId)
                        .sink(
                            receiveCompletion: { _ in },
                            receiveValue: { _ in }
                        )
                        .store(in: &self!.cancellables)
                }
            }
            .store(in: &cancellables)
        
        return Just(Output(
            properties: properties,
            statistics: statistics,
            isLoading: loadingSubject.eraseToAnyPublisher(),
            error: errorSubject.eraseToAnyPublisher(),
            cacheStatus: cacheStatusSubject.eraseToAnyPublisher()
        ))
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func loadProperties(forceReload: Bool) -> AnyPublisher<[Property], Error> {
        monitor.track(name: "load_properties", attributes: ["force_reload": String(forceReload)])
        
        if !forceReload, let cached = propertyCache.object(forKey: "dashboard_properties") as? [Property] {
            return Just(cached)
                .setFailureType(to: Error.self)
                .eraseToAnyPublisher()
        }
        
        return propertyRepository.searchProperties()
            .map { [weak self] properties in
                let filtered = properties.filter { $0.owner.id == UserDefaults.standard.string(forKey: "userId") }
                let sorted = filtered.sorted { $0.updatedAt > $1.updatedAt }
                self?.propertyCache.setObject(sorted as NSArray, forKey: "dashboard_properties")
                return sorted
            }
            .eraseToAnyPublisher()
    }
    
    private func prefetchPropertyDetails(properties: [Property]) {
        backgroundQueue.async { [weak self] in
            guard let self = self else { return }
            
            let propertyIds = properties.prefix(5).map { $0.id }
            propertyIds.forEach { id in
                self.propertyRepository.getPropertyDetails(id: id)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { _ in }
                    )
                    .store(in: &self.cancellables)
            }
        }
    }
    
    private func calculateStats(from properties: [Property]) -> DashboardStats {
        let activeListings = properties.filter { $0.status == .available }.count
        let pendingApplications = properties.reduce(0) { count, property in
            count + (property.applications as? Set<ApplicationEntity>)?.count ?? 0
        }
        let totalRevenue = properties.reduce(0.0) { sum, property in
            sum + property.price
        }
        
        return DashboardStats(
            totalProperties: properties.count,
            activeListings: activeListings,
            pendingApplications: pendingApplications,
            totalRevenue: totalRevenue
        )
    }
}