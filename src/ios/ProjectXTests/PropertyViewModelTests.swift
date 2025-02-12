import XCTest
import Combine
@testable import ProjectX

/// Comprehensive test suite for PropertyListViewModel functionality including pagination, filtering, and performance
final class PropertyViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: PropertyListViewModel!
    private var mockRepository: MockPropertyRepository!
    private var cancellables: Set<AnyCancellable>!
    private var asyncExpectation: XCTestExpectation!
    private let testQueue = DispatchQueue(label: "com.projectx.tests.propertyviewmodel")
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        mockRepository = MockPropertyRepository()
        sut = PropertyListViewModel(repository: mockRepository)
        cancellables = Set<AnyCancellable>()
        asyncExpectation = expectation(description: "Async operation")
    }
    
    override func tearDown() {
        cancellables.forEach { $0.cancel() }
        cancellables = nil
        mockRepository = nil
        sut = nil
        asyncExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Initial State Tests
    
    func testInitialState() {
        XCTAssertTrue(sut.properties.isEmpty, "Properties should be empty initially")
        XCTAssertFalse(sut.isLoading, "Should not be loading initially")
        XCTAssertNil(sut.error, "Error should be nil initially")
        XCTAssertEqual(sut.currentPage, 1, "Current page should be 1 initially")
        XCTAssertTrue(sut.hasMorePages, "Should have more pages initially")
    }
    
    // MARK: - Property Loading Tests
    
    func testLoadPropertiesSuccess() {
        // Given
        let mockProperties = createMockProperties(count: 20)
        mockRepository.mockPaginatedProperties = mockProperties
        
        // When
        let loadExpectation = expectation(description: "Load properties")
        
        sut.$properties
            .dropFirst()
            .sink { properties in
                XCTAssertEqual(properties.count, 20)
                loadExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.loadProperties()
        
        // Then
        wait(for: [loadExpectation], timeout: 2.0)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }
    
    func testLoadPropertiesFailure() {
        // Given
        mockRepository.mockError = APIError.networkError(NSError(domain: "test", code: -1))
        
        // When
        let errorExpectation = expectation(description: "Error handling")
        
        sut.$error
            .dropFirst()
            .sink { error in
                XCTAssertNotNil(error)
                errorExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.loadProperties()
        
        // Then
        wait(for: [errorExpectation], timeout: 2.0)
        XCTAssertFalse(sut.isLoading)
        XCTAssertTrue(sut.properties.isEmpty)
    }
    
    // MARK: - Pagination Tests
    
    func testLoadNextPage() {
        // Given
        let initialProperties = createMockProperties(count: 20)
        let nextPageProperties = createMockProperties(count: 20, startingId: 21)
        mockRepository.mockPaginatedProperties = initialProperties
        
        // When - Load first page
        let firstPageExpectation = expectation(description: "First page load")
        
        sut.$properties
            .dropFirst()
            .sink { properties in
                XCTAssertEqual(properties.count, 20)
                firstPageExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.loadProperties()
        wait(for: [firstPageExpectation], timeout: 2.0)
        
        // When - Load next page
        mockRepository.mockPaginatedProperties = nextPageProperties
        let nextPageExpectation = expectation(description: "Next page load")
        
        sut.$properties
            .dropFirst()
            .sink { properties in
                XCTAssertEqual(properties.count, 40)
                nextPageExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.loadNextPage()
        
        // Then
        wait(for: [nextPageExpectation], timeout: 2.0)
        XCTAssertFalse(sut.isLoading)
        XCTAssertEqual(sut.currentPage, 2)
    }
    
    // MARK: - Filter Tests
    
    func testApplyFilter() {
        // Given
        let filter = PropertyFilter(
            location: "Downtown",
            minPrice: 1000,
            maxPrice: 5000,
            bedrooms: 2,
            petFriendly: true,
            sortBy: .priceAscending
        )
        
        let filteredProperties = createMockProperties(count: 5)
        mockRepository.mockPaginatedProperties = filteredProperties
        
        // When
        let filterExpectation = expectation(description: "Filter application")
        
        sut.$properties
            .dropFirst()
            .sink { properties in
                XCTAssertEqual(properties.count, 5)
                filterExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.applyFilter(filter)
        
        // Then
        wait(for: [filterExpectation], timeout: 2.0)
        XCTAssertEqual(sut.currentPage, 1)
        XCTAssertFalse(sut.isLoading)
    }
    
    // MARK: - Performance Tests
    
    func testLoadingPerformance() {
        measure {
            // Given
            let mockProperties = createMockProperties(count: 100)
            mockRepository.mockPaginatedProperties = mockProperties
            
            // When
            let performanceExpectation = expectation(description: "Performance test")
            
            sut.$properties
                .dropFirst()
                .sink { _ in
                    performanceExpectation.fulfill()
                }
                .store(in: &cancellables)
            
            sut.loadProperties()
            
            // Then
            wait(for: [performanceExpectation], timeout: 2.0)
        }
    }
    
    // MARK: - Helper Methods
    
    private func createMockProperties(count: Int, startingId: Int = 1) -> [Property] {
        return (startingId...(startingId + count - 1)).map { id in
            try! Property(
                id: "\(id)",
                name: "Property \(id)",
                propertyDescription: "Description \(id)",
                price: Double(1000 * id),
                bedrooms: 2,
                bathrooms: 2,
                squareFootage: 1000.0,
                address: "123 Test St",
                latitude: 37.7749,
                longitude: -122.4194,
                isPetFriendly: true,
                status: .available,
                owner: createMockUser(),
                availableFrom: Date(),
                createdAt: Date(),
                updatedAt: Date()
            )
        }
    }
    
    private func createMockUser() -> User {
        try! User(
            id: UUID().uuidString,
            email: "test@example.com",
            name: "Test User",
            phone: "+11234567890",
            createdAt: Date(),
            updatedAt: Date()
        )
    }
}

// MARK: - Mock Repository

private class MockPropertyRepository: PropertyRepository {
    var mockPaginatedProperties: [Property] = []
    var mockError: Error?
    var mockDelay: TimeInterval = 0.1
    var shouldSimulateTimeout = false
    
    override func searchProperties(
        location: String?,
        minPrice: Double?,
        maxPrice: Double?,
        bedrooms: Int?,
        petFriendly: Bool?
    ) -> AnyPublisher<[Property], Error> {
        if shouldSimulateTimeout {
            return Fail(error: APIError.networkError(NSError(domain: "timeout", code: -1)))
                .delay(for: .seconds(5), scheduler: RunLoop.main)
                .eraseToAnyPublisher()
        }
        
        if let error = mockError {
            return Fail(error: error)
                .delay(for: .seconds(mockDelay), scheduler: RunLoop.main)
                .eraseToAnyPublisher()
        }
        
        return Just(mockPaginatedProperties)
            .delay(for: .seconds(mockDelay), scheduler: RunLoop.main)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}