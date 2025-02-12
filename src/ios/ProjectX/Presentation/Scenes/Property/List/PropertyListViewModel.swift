import Foundation
import Combine

/// ViewModel managing property listing data and user interactions with enhanced performance optimization
public final class PropertyListViewModel {
    
    // MARK: - Published Properties
    
    @Published private(set) var properties: [Property] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingNextPage = false
    @Published private(set) var error: String?
    @Published private(set) var currentSortOption: SortOption = .default
    
    // MARK: - Private Properties
    
    private let repository: PropertyRepository
    private var cancellables = Set<AnyCancellable>()
    private let filterSubject = CurrentValueSubject<PropertyFilter, Never>(.default)
    private var currentPage = 1
    private let pageSize: Int
    private var hasMorePages = true
    private var searchDebounceTimer: Timer?
    private var prefetchOperation: DispatchWorkItem?
    
    // MARK: - Constants
    
    private enum Constants {
        static let searchDebounceInterval: TimeInterval = 0.5
        static let prefetchThreshold = 5
        static let maxConcurrentRequests = 2
    }
    
    // MARK: - Initialization
    
    /// Initialize PropertyListViewModel with repository and configuration
    /// - Parameters:
    ///   - repository: Property repository instance
    ///   - pageSize: Number of items per page
    public init(repository: PropertyRepository, pageSize: Int = 20) {
        self.repository = repository
        self.pageSize = pageSize
        
        setupFilterSubscription()
        setupPrefetching()
    }
    
    // MARK: - Public Methods
    
    /// Load properties with pagination and caching
    /// - Parameter resetPagination: Whether to reset pagination state
    public func loadProperties(resetPagination: Bool = false) {
        if resetPagination {
            currentPage = 1
            hasMorePages = true
            properties = []
        }
        
        guard !isLoading else { return }
        isLoading = true
        error = nil
        
        let currentFilter = filterSubject.value
        
        repository.searchProperties(
            location: currentFilter.location,
            minPrice: currentFilter.minPrice,
            maxPrice: currentFilter.maxPrice,
            bedrooms: currentFilter.bedrooms,
            petFriendly: currentFilter.petFriendly
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] completion in
            guard let self = self else { return }
            self.isLoading = false
            
            if case .failure(let error) = completion {
                self.error = error.localizedDescription
            }
        } receiveValue: { [weak self] newProperties in
            guard let self = self else { return }
            
            if resetPagination {
                self.properties = newProperties
            } else {
                self.properties.append(contentsOf: newProperties)
            }
            
            self.hasMorePages = newProperties.count >= self.pageSize
            self.currentPage += 1
            
            // Setup prefetching for next page
            self.setupPrefetchingForNextPage()
        }
        .store(in: &cancellables)
    }
    
    /// Apply filter with debouncing and validation
    /// - Parameter filter: Property filter criteria
    public func applyFilter(_ filter: PropertyFilter) {
        searchDebounceTimer?.invalidate()
        
        searchDebounceTimer = Timer.scheduledTimer(withTimeInterval: Constants.searchDebounceInterval, repeats: false) { [weak self] _ in
            self?.filterSubject.send(filter)
        }
    }
    
    /// Load next page of properties
    public func loadNextPage() {
        guard !isLoadingNextPage && hasMorePages else { return }
        
        isLoadingNextPage = true
        
        let currentFilter = filterSubject.value
        
        repository.searchProperties(
            location: currentFilter.location,
            minPrice: currentFilter.minPrice,
            maxPrice: currentFilter.maxPrice,
            bedrooms: currentFilter.bedrooms,
            petFriendly: currentFilter.petFriendly
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] completion in
            guard let self = self else { return }
            self.isLoadingNextPage = false
            
            if case .failure(let error) = completion {
                self.error = error.localizedDescription
            }
        } receiveValue: { [weak self] newProperties in
            guard let self = self else { return }
            
            self.properties.append(contentsOf: newProperties)
            self.hasMorePages = newProperties.count >= self.pageSize
            self.currentPage += 1
            
            // Setup prefetching for next page
            self.setupPrefetchingForNextPage()
        }
        .store(in: &cancellables)
    }
    
    // MARK: - Private Methods
    
    private func setupFilterSubscription() {
        filterSubject
            .dropFirst()
            .removeDuplicates()
            .debounce(for: .seconds(Constants.searchDebounceInterval), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.loadProperties(resetPagination: true)
            }
            .store(in: &cancellables)
    }
    
    private func setupPrefetching() {
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.setupPrefetchingForNextPage()
            }
            .store(in: &cancellables)
    }
    
    private func setupPrefetchingForNextPage() {
        prefetchOperation?.cancel()
        
        guard hasMorePages else { return }
        
        let operation = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            
            let currentFilter = self.filterSubject.value
            
            self.repository.prefetchProperties(
                page: self.currentPage + 1,
                pageSize: self.pageSize,
                filter: currentFilter
            )
        }
        
        prefetchOperation = operation
        DispatchQueue.global(qos: .utility).asyncAfter(
            deadline: .now() + 1.0,
            execute: operation
        )
    }
}

// MARK: - Supporting Types

/// Property filter criteria
public struct PropertyFilter: Equatable {
    let location: String?
    let minPrice: Double?
    let maxPrice: Double?
    let bedrooms: Int?
    let petFriendly: Bool?
    let sortBy: SortOption
    
    static let `default` = PropertyFilter(
        location: nil,
        minPrice: nil,
        maxPrice: nil,
        bedrooms: nil,
        petFriendly: nil,
        sortBy: .default
    )
}

/// Property sort options
public enum SortOption: String {
    case priceAscending = "price_asc"
    case priceDescending = "price_desc"
    case dateNewest = "date_desc"
    case dateOldest = "date_asc"
    
    static let `default` = SortOption.dateNewest
}