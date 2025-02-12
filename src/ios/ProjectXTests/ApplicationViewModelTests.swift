//
// ApplicationViewModelTests.swift
// ProjectXTests
//
// Comprehensive test suite for ApplicationViewModel with performance metrics and memory leak detection
// Version: iOS 15.0+
//

import XCTest
import Combine
@testable import ProjectX

final class ApplicationViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: ApplicationViewModel!
    private var mockRepository: MockApplicationRepository!
    private var mockAnalytics: MockAnalyticsManager!
    private var cancellables: Set<AnyCancellable>!
    private let testQueue = DispatchQueue(label: "com.projectx.test", qos: .userInitiated)
    private var asyncExpectation: XCTestExpectation!
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        mockRepository = MockApplicationRepository()
        mockAnalytics = MockAnalyticsManager()
        sut = ApplicationViewModel(repository: mockRepository, analyticsManager: mockAnalytics)
        cancellables = Set<AnyCancellable>()
        asyncExpectation = expectation(description: "Async operation")
    }
    
    override func tearDown() {
        // Verify no memory leaks
        addTeardownBlock { [weak sut, weak mockRepository] in
            XCTAssertNil(sut, "ApplicationViewModel should be deallocated")
            XCTAssertNil(mockRepository, "MockRepository should be deallocated")
        }
        
        cancellables.forEach { $0.cancel() }
        cancellables.removeAll()
        sut = nil
        mockRepository = nil
        mockAnalytics = nil
        asyncExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Submit Application Tests
    
    func testSubmitApplication_Success_WithPerformanceMetrics() throws {
        // Given
        let metric = XCTMeasureMetric()
        measure(metrics: [metric]) {
            // Create test application
            let testUser = try! User(id: "test-user", 
                                   email: "test@example.com",
                                   name: "Test User",
                                   phone: "+11234567890",
                                   createdAt: Date(),
                                   updatedAt: Date())
            
            let testProperty = try! Property(id: "test-property",
                                           name: "Test Property",
                                           propertyDescription: "Test Description",
                                           price: 1500.0,
                                           bedrooms: 2,
                                           bathrooms: 2,
                                           squareFootage: 1000.0,
                                           address: "123 Test St",
                                           latitude: 37.7749,
                                           longitude: -122.4194,
                                           isPetFriendly: true,
                                           status: .available,
                                           owner: testUser,
                                           availableFrom: Date(),
                                           createdAt: Date(),
                                           updatedAt: Date())
            
            let testApplication = try! Application(id: "test-app",
                                                 status: "draft",
                                                 monthlyIncome: 5000.0,
                                                 employmentStatus: "employed",
                                                 currentAddress: "456 Current St",
                                                 creditScore: "750",
                                                 applicant: testUser,
                                                 property: testProperty,
                                                 submittedAt: Date(),
                                                 updatedAt: Date())
            
            // Configure mock success response
            mockRepository.submitApplicationResult = .success(testApplication)
            
            // When
            let output = sut.transform(.submitApplication(testApplication))
            
            // Track state changes
            var states: [Application?] = []
            var loadingStates: [Bool] = []
            var errors: [ApplicationError] = []
            
            output.applicationState
                .sink { state in states.append(state) }
                .store(in: &self.cancellables)
            
            output.isLoading
                .sink { loading in loadingStates.append(loading) }
                .store(in: &self.cancellables)
            
            output.error
                .sink { error in errors.append(error) }
                .store(in: &self.cancellables)
            
            // Then
            XCTAssertEqual(states.count, 1)
            XCTAssertEqual(states.first??.id, testApplication.id)
            XCTAssertEqual(loadingStates, [true, false])
            XCTAssertTrue(errors.isEmpty)
            
            // Verify analytics tracking
            XCTAssertTrue(mockAnalytics.trackedEvents.contains { $0.name == "application_submit_started" })
            XCTAssertTrue(mockAnalytics.trackedEvents.contains { $0.name == "application_submit_success" })
        }
    }
    
    func testSubmitApplication_ThreadSafety() {
        // Given
        let concurrentQueue = DispatchQueue(label: "test.concurrent", attributes: .concurrent)
        let submissionCount = 10
        let submissionExpectation = expectation(description: "Concurrent submissions")
        submissionExpectation.expectedFulfillmentCount = submissionCount
        
        // When
        for i in 0..<submissionCount {
            concurrentQueue.async {
                let testUser = try! User(id: "user-\(i)",
                                       email: "test\(i)@example.com",
                                       name: "Test User \(i)",
                                       phone: "+1123456789\(i)",
                                       createdAt: Date(),
                                       updatedAt: Date())
                
                let testProperty = try! Property(id: "property-\(i)",
                                               name: "Test Property \(i)",
                                               propertyDescription: "Description \(i)",
                                               price: 1500.0,
                                               bedrooms: 2,
                                               bathrooms: 2,
                                               squareFootage: 1000.0,
                                               address: "123 Test St \(i)",
                                               latitude: 37.7749,
                                               longitude: -122.4194,
                                               isPetFriendly: true,
                                               status: .available,
                                               owner: testUser,
                                               availableFrom: Date(),
                                               createdAt: Date(),
                                               updatedAt: Date())
                
                let testApplication = try! Application(id: "app-\(i)",
                                                     status: "draft",
                                                     monthlyIncome: 5000.0,
                                                     employmentStatus: "employed",
                                                     currentAddress: "456 Current St \(i)",
                                                     creditScore: "750",
                                                     applicant: testUser,
                                                     property: testProperty,
                                                     submittedAt: Date(),
                                                     updatedAt: Date())
                
                self.mockRepository.submitApplicationResult = .success(testApplication)
                let output = self.sut.transform(.submitApplication(testApplication))
                
                output.applicationState
                    .sink { _ in submissionExpectation.fulfill() }
                    .store(in: &self.cancellables)
            }
        }
        
        // Then
        wait(for: [submissionExpectation], timeout: 5.0)
        XCTAssertEqual(mockAnalytics.trackedEvents.filter { $0.name == "application_submit_success" }.count, submissionCount)
    }
    
    func testUploadDocument_Timeout() {
        // Given
        let testData = "test".data(using: .utf8)!
        let timeoutExpectation = expectation(description: "Document upload timeout")
        
        // Configure mock timeout
        mockRepository.uploadDocumentResult = .failure(ApplicationError.documentError)
        
        // When
        let output = sut.transform(.uploadDocument(testData, "application/pdf", "identification"))
        
        output.error
            .sink { error in
                XCTAssertEqual(error as? ApplicationError, .documentError)
                timeoutExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Then
        wait(for: [timeoutExpectation], timeout: 2.0)
        XCTAssertTrue(mockAnalytics.trackedEvents.contains { $0.name == "document_upload_error" })
    }
}

// MARK: - Mock Classes

private class MockApplicationRepository: ApplicationRepository {
    var submitApplicationResult: Result<Application, Error>!
    var uploadDocumentResult: Result<String, Error>!
    
    override func submitApplication(_ application: Application) -> AnyPublisher<Application, Error> {
        return Result.Publisher(submitApplicationResult)
            .eraseToAnyPublisher()
    }
    
    override func uploadDocument(applicationId: String, documentData: Data, mimeType: String) -> AnyPublisher<String, Error> {
        return Result.Publisher(uploadDocumentResult)
            .eraseToAnyPublisher()
    }
}

private class MockAnalyticsManager: AnalyticsManager {
    struct TrackedEvent {
        let name: String
        let properties: [String: Any]
    }
    
    var trackedEvents: [TrackedEvent] = []
    
    func track(_ eventName: String, properties: [String: Any]) {
        trackedEvents.append(TrackedEvent(name: eventName, properties: properties))
    }
}