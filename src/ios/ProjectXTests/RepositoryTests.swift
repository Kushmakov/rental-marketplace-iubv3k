//
// RepositoryTests.swift
// ProjectXTests
//
// Comprehensive test suite for validating repository layer implementations
// XCTest version: iOS 15.0+
// Combine version: iOS 15.0+
//

import XCTest
import Combine
@testable import ProjectX

final class AuthRepositoryTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: AuthRepository!
    private var cancellables: Set<AnyCancellable>!
    private var asyncExpectation: XCTestExpectation!
    private let defaultTimeout: TimeInterval = 5.0
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        sut = AuthRepository()
        cancellables = Set<AnyCancellable>()
        asyncExpectation = expectation(description: "Async operation")
    }
    
    override func tearDown() {
        cancellables.removeAll()
        sut = nil
        super.tearDown()
    }
    
    // MARK: - Authentication Tests
    
    func testLoginSuccess() {
        // Given
        let email = "test@example.com"
        let password = "SecurePassword123!"
        let expectedUser = User(id: UUID().uuidString, email: email)
        
        // When
        var receivedUser: User?
        var receivedError: AuthError?
        
        sut.login(email: email, password: password)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        receivedError = error
                    }
                    self.asyncExpectation.fulfill()
                },
                receiveValue: { user in
                    receivedUser = user
                }
            )
            .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        XCTAssertNil(receivedError)
        XCTAssertNotNil(receivedUser)
        XCTAssertEqual(receivedUser?.email, expectedUser.email)
    }
    
    func testLoginWithInvalidCredentials() {
        // Given
        let email = "invalid@example.com"
        let password = "wrong"
        
        // When
        var receivedError: AuthError?
        
        sut.login(email: email, password: password)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        receivedError = error
                    }
                    self.asyncExpectation.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        XCTAssertNotNil(receivedError)
        XCTAssertEqual(receivedError, .invalidCredentials)
    }
    
    func testLoginWithMFA() {
        // Given
        let email = "mfa@example.com"
        let password = "SecurePassword123!"
        let mfaCode = "123456"
        
        // When
        var receivedUser: User?
        var receivedError: AuthError?
        
        sut.login(email: email, password: password)
            .flatMap { _ in
                self.sut.validateMFA(code: mfaCode)
            }
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        receivedError = error
                    }
                    self.asyncExpectation.fulfill()
                },
                receiveValue: { user in
                    receivedUser = user
                }
            )
            .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        XCTAssertNil(receivedError)
        XCTAssertNotNil(receivedUser)
    }
}

final class PropertyRepositoryTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: PropertyRepository!
    private var cancellables: Set<AnyCancellable>!
    private var asyncExpectation: XCTestExpectation!
    private let defaultTimeout: TimeInterval = 5.0
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        let propertyService = PropertyService(configuration: .default)
        sut = PropertyRepository(propertyService: propertyService)
        cancellables = Set<AnyCancellable>()
        asyncExpectation = expectation(description: "Async operation")
    }
    
    override func tearDown() {
        cancellables.removeAll()
        sut = nil
        super.tearDown()
    }
    
    // MARK: - Property Search Tests
    
    func testPropertySearchPerformance() {
        // Given
        let startTime = Date()
        let location = "San Francisco"
        let minPrice = 1000.0
        let maxPrice = 5000.0
        
        // When
        var receivedProperties: [Property]?
        var responseTime: TimeInterval?
        
        sut.searchProperties(
            location: location,
            minPrice: minPrice,
            maxPrice: maxPrice
        )
        .sink(
            receiveCompletion: { _ in
                responseTime = Date().timeIntervalSince(startTime)
                self.asyncExpectation.fulfill()
            },
            receiveValue: { properties in
                receivedProperties = properties
            }
        )
        .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        XCTAssertNotNil(receivedProperties)
        XCTAssertLessThan(responseTime ?? defaultTimeout, 2.0) // Verify <2s response time
    }
    
    func testPropertySearchCaching() {
        // Given
        let location = "New York"
        let asyncExpectation2 = expectation(description: "Second request")
        var firstResponseTime: TimeInterval?
        var secondResponseTime: TimeInterval?
        
        // When - First request
        let startTime1 = Date()
        sut.searchProperties(location: location)
            .sink(
                receiveCompletion: { _ in
                    firstResponseTime = Date().timeIntervalSince(startTime1)
                    self.asyncExpectation.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        
        // When - Second request (should hit cache)
        let startTime2 = Date()
        sut.searchProperties(location: location)
            .sink(
                receiveCompletion: { _ in
                    secondResponseTime = Date().timeIntervalSince(startTime2)
                    asyncExpectation2.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation2], timeout: defaultTimeout)
        XCTAssertNotNil(firstResponseTime)
        XCTAssertNotNil(secondResponseTime)
        XCTAssertLessThan(secondResponseTime!, firstResponseTime!) // Cached response should be faster
    }
    
    func testOfflinePropertyAccess() {
        // Given
        let propertyId = "test-property-id"
        let asyncExpectation2 = expectation(description: "Offline request")
        
        // First, cache the property
        sut.getPropertyDetails(id: propertyId)
            .sink(
                receiveCompletion: { _ in
                    self.asyncExpectation.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        
        // When - Simulate offline mode and try to access property
        var receivedProperty: Property?
        var receivedError: Error?
        
        sut.getCachedProperties()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        receivedError = error
                    }
                    asyncExpectation2.fulfill()
                },
                receiveValue: { properties in
                    receivedProperty = properties.first(where: { $0.id == propertyId })
                }
            )
            .store(in: &cancellables)
        
        // Then
        wait(for: [asyncExpectation2], timeout: defaultTimeout)
        XCTAssertNil(receivedError)
        XCTAssertNotNil(receivedProperty)
        XCTAssertEqual(receivedProperty?.id, propertyId)
    }
}