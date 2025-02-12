//
// PaymentViewModelTests.swift
// ProjectXTests
//
// Comprehensive test suite for PaymentViewModel validating payment processing, security, and performance
// XCTest version: iOS 15.0+
// Combine version: iOS 15.0+
//

import XCTest
import Combine
@testable import ProjectX

@MainActor
final class PaymentViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: PaymentViewModel!
    private var mockRepository: MockPaymentRepository!
    private var mockSecurityValidator: MockPaymentSecurityValidator!
    private var mockMetricsTracker: MockPaymentMetricsTracker!
    private var cancellables: Set<AnyCancellable>!
    private let defaultTimeout: TimeInterval = 2.0
    
    // MARK: - Test Lifecycle
    
    override func setUp() async throws {
        try await super.setUp()
        mockRepository = MockPaymentRepository()
        mockSecurityValidator = MockPaymentSecurityValidator()
        mockMetricsTracker = MockPaymentMetricsTracker()
        sut = PaymentViewModel(
            repository: mockRepository,
            securityValidator: mockSecurityValidator,
            metricsTracker: mockMetricsTracker
        )
        cancellables = Set<AnyCancellable>()
    }
    
    override func tearDown() async throws {
        sut = nil
        mockRepository = nil
        mockSecurityValidator = nil
        mockMetricsTracker = nil
        cancellables = nil
        try await super.tearDown()
    }
    
    // MARK: - Payment Processing Tests
    
    func testProcessPayment_Success() async throws {
        // Given
        let payment = PaymentTestData.validPayment
        let expectation = expectation(description: "Payment processed successfully")
        var receivedStates: [PaymentViewState] = []
        
        mockSecurityValidator.validateTokenResult = .success(())
        mockRepository.processPaymentResult = .success(payment)
        
        // When
        sut.state
            .sink { state in
                receivedStates.append(state)
                if case .success = state {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        _ = await sut.processPayment(payment)
        
        // Then
        await fulfillment(of: [expectation], timeout: defaultTimeout)
        
        XCTAssertEqual(receivedStates.count, 3)
        XCTAssertEqual(receivedStates[0], .idle)
        XCTAssertEqual(receivedStates[1], .validating)
        XCTAssertEqual(receivedStates[2], .success(payment))
        XCTAssertTrue(mockSecurityValidator.validateTokenCalled)
        XCTAssertTrue(mockRepository.processPaymentCalled)
        XCTAssertTrue(mockMetricsTracker.trackPaymentStartCalled)
        XCTAssertTrue(mockMetricsTracker.trackPaymentSuccessCalled)
    }
    
    func testProcessPayment_SecurityValidationFailure() async throws {
        // Given
        let payment = PaymentTestData.validPayment
        let expectation = expectation(description: "Security validation failed")
        var receivedStates: [PaymentViewState] = []
        
        mockSecurityValidator.validateTokenResult = .failure(SecurityError.tokenExpired)
        
        // When
        sut.state
            .sink { state in
                receivedStates.append(state)
                if case .securityError = state {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        _ = await sut.processPayment(payment)
        
        // Then
        await fulfillment(of: [expectation], timeout: defaultTimeout)
        
        XCTAssertEqual(receivedStates.count, 3)
        XCTAssertEqual(receivedStates[0], .idle)
        XCTAssertEqual(receivedStates[1], .validating)
        XCTAssertEqual(receivedStates[2], .securityError(.tokenExpired))
        XCTAssertTrue(mockSecurityValidator.validateTokenCalled)
        XCTAssertFalse(mockRepository.processPaymentCalled)
        XCTAssertTrue(mockMetricsTracker.trackPaymentErrorCalled)
    }
    
    func testProcessPayment_InvalidAmount() async throws {
        // Given
        let payment = PaymentTestData.invalidPayment
        let expectation = expectation(description: "Invalid payment amount")
        var receivedStates: [PaymentViewState] = []
        
        // When
        sut.state
            .sink { state in
                receivedStates.append(state)
                if case .error(let error) = state, case .validation = error {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        _ = await sut.processPayment(payment)
        
        // Then
        await fulfillment(of: [expectation], timeout: defaultTimeout)
        
        XCTAssertEqual(receivedStates.count, 3)
        XCTAssertEqual(receivedStates[0], .idle)
        XCTAssertEqual(receivedStates[1], .validating)
        if case .error(let error) = receivedStates[2], case .validation = error {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected validation error")
        }
        XCTAssertFalse(mockSecurityValidator.validateTokenCalled)
        XCTAssertFalse(mockRepository.processPaymentCalled)
        XCTAssertTrue(mockMetricsTracker.trackPaymentErrorCalled)
    }
    
    // MARK: - Payment History Tests
    
    func testGetPaymentHistory_Success() async throws {
        // Given
        let payments = [PaymentTestData.validPayment]
        let expectation = expectation(description: "Payment history retrieved")
        let filter = PaymentHistoryFilter(startDate: nil, endDate: nil, status: nil, type: nil, minAmount: nil, maxAmount: nil)
        
        mockRepository.getPaymentHistoryResult = .success(payments)
        
        // When
        let result = try await sut.getPaymentHistory(page: 1, limit: 10, filter: filter)
            .async()
        
        // Then
        XCTAssertEqual(result, payments)
        XCTAssertTrue(mockRepository.getPaymentHistoryCalled)
        XCTAssertTrue(mockMetricsTracker.trackHistoryFetchCalled)
    }
    
    func testGetPaymentHistory_NetworkError() async throws {
        // Given
        let expectation = expectation(description: "Network error occurred")
        let filter = PaymentHistoryFilter(startDate: nil, endDate: nil, status: nil, type: nil, minAmount: nil, maxAmount: nil)
        
        mockRepository.getPaymentHistoryResult = .failure(APIError.networkError(NSError(domain: "", code: -1)))
        
        // When
        do {
            _ = try await sut.getPaymentHistory(page: 1, limit: 10, filter: filter)
                .async()
            XCTFail("Expected network error")
        } catch {
            // Then
            XCTAssertTrue(mockRepository.getPaymentHistoryCalled)
            XCTAssertTrue(error is APIError)
        }
    }
    
    // MARK: - Performance Tests
    
    func testPaymentProcessing_Performance() throws {
        // Given
        let payment = PaymentTestData.validPayment
        mockSecurityValidator.validateTokenResult = .success(())
        mockRepository.processPaymentResult = .success(payment)
        
        // When/Then
        measure {
            let expectation = expectation(description: "Payment processed")
            
            Task {
                _ = await sut.processPayment(payment)
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: defaultTimeout)
        }
    }
}

// MARK: - Test Helpers

private extension PaymentViewModelTests {
    enum PaymentTestData {
        static let validPayment = Payment(
            id: UUID().uuidString,
            amount: 1000.0,
            currency: "USD",
            status: .pending,
            type: .rent,
            applicationId: UUID().uuidString,
            userId: UUID().uuidString,
            propertyId: UUID().uuidString
        )
        
        static let invalidPayment = Payment(
            id: UUID().uuidString,
            amount: 0,
            currency: "USD",
            status: .pending,
            type: .rent,
            applicationId: UUID().uuidString,
            userId: UUID().uuidString,
            propertyId: UUID().uuidString
        )
    }
}

// MARK: - Mock Objects

private final class MockPaymentRepository: PaymentRepository {
    var processPaymentCalled = false
    var getPaymentHistoryCalled = false
    
    var processPaymentResult: Result<Payment, Error> = .failure(NSError(domain: "", code: -1))
    var getPaymentHistoryResult: Result<[Payment], Error> = .failure(NSError(domain: "", code: -1))
    
    func processPayment(_ payment: Payment) -> AnyPublisher<Payment, Error> {
        processPaymentCalled = true
        return processPaymentResult.publisher.eraseToAnyPublisher()
    }
    
    func getPaymentHistory(page: Int, limit: Int, filter: PaymentHistoryFilter?) -> AnyPublisher<[Payment], Error> {
        getPaymentHistoryCalled = true
        return getPaymentHistoryResult.publisher.eraseToAnyPublisher()
    }
}

private final class MockPaymentSecurityValidator {
    var validateTokenCalled = false
    var validateTokenResult: Result<Void, Error> = .success(())
    
    func validateToken(_ token: String) -> AnyPublisher<Void, Error> {
        validateTokenCalled = true
        return validateTokenResult.publisher.eraseToAnyPublisher()
    }
}

private final class MockPaymentMetricsTracker {
    var trackPaymentStartCalled = false
    var trackPaymentSuccessCalled = false
    var trackPaymentErrorCalled = false
    var trackHistoryFetchCalled = false
    
    func trackPaymentStart(_ payment: Payment) {
        trackPaymentStartCalled = true
    }
    
    func trackPaymentSuccess(_ payment: Payment) {
        trackPaymentSuccessCalled = true
    }
    
    func trackPaymentError(_ error: Error) {
        trackPaymentErrorCalled = true
    }
    
    func trackHistoryFetch(count: Int) {
        trackHistoryFetchCalled = true
    }
}

// MARK: - Publisher Extensions

private extension Publisher {
    func async() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            cancellable = self.sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        break
                    case .failure(let error):
                        continuation.resume(throwing: error)
                    }
                    cancellable?.cancel()
                },
                receiveValue: { value in
                    continuation.resume(returning: value)
                    cancellable?.cancel()
                }
            )
        }
    }
}