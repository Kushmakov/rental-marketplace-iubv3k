//
// ApplicationViewModel.swift
// ProjectX
//
// Thread-safe ViewModel managing rental application flow with comprehensive validation and security
// Version: iOS 15.0+
//

import Foundation
import Combine
import CryptoKit
import Security
import Analytics

/// Thread-safe ViewModel that manages rental application flow with comprehensive validation and monitoring
@MainActor
public final class ApplicationViewModel {
    
    // MARK: - Types
    
    /// Input events that can be processed by the ViewModel
    public enum Input {
        case submitApplication(Application)
        case uploadDocument(Data, String, String)
        case updateStatus(String, String)
        case validateApplication(Application)
    }
    
    /// Output state updates from the ViewModel
    public struct Output {
        let applicationState: CurrentValueSubject<Application?, Never>
        let isLoading: PassthroughSubject<Bool, Never>
        let progress: PassthroughSubject<Double, Never>
        let error: PassthroughSubject<ApplicationError, Never>
    }
    
    // MARK: - Properties
    
    private let repository: ApplicationRepository
    private let analyticsManager: AnalyticsManager
    private var cancellables = Set<AnyCancellable>()
    
    private let applicationSubject = CurrentValueSubject<Application?, Never>(nil)
    private let errorSubject = PassthroughSubject<ApplicationError, Never>()
    private let loadingSubject = PassthroughSubject<Bool, Never>()
    private let progressSubject = PassthroughSubject<Double, Never>()
    
    private let stateLock = NSLock()
    
    // MARK: - Initialization
    
    /// Initializes the ViewModel with required dependencies
    /// - Parameters:
    ///   - repository: Repository for application data management
    ///   - analyticsManager: Analytics tracking manager
    public init(repository: ApplicationRepository, analyticsManager: AnalyticsManager) {
        self.repository = repository
        self.analyticsManager = analyticsManager
        
        setupErrorHandling()
    }
    
    // MARK: - Public Interface
    
    /// Transforms input events into state updates with validation
    /// - Parameter input: Input event to process
    /// - Returns: Output state updates
    public func transform(_ input: Input) -> Output {
        switch input {
        case .submitApplication(let application):
            handleSubmitApplication(application)
            
        case .uploadDocument(let data, let mimeType, let documentType):
            handleDocumentUpload(data, mimeType: mimeType, documentType: documentType)
            
        case .updateStatus(let applicationId, let newStatus):
            handleStatusUpdate(applicationId: applicationId, newStatus: newStatus)
            
        case .validateApplication(let application):
            handleValidation(application)
        }
        
        return Output(
            applicationState: applicationSubject,
            isLoading: loadingSubject,
            progress: progressSubject,
            error: errorSubject
        )
    }
    
    /// Submits a new rental application with validation
    /// - Parameter application: Application to submit
    /// - Returns: Publisher that emits completion or error
    public func submitApplication(_ application: Application) -> AnyPublisher<Void, ApplicationError> {
        analyticsManager.track("application_submit_started", properties: [
            "application_id": application.id,
            "property_id": application.property.id
        ])
        
        loadingSubject.send(true)
        
        return repository.submitApplication(application)
            .handleEvents(
                receiveOutput: { [weak self] submittedApplication in
                    self?.stateLock.lock()
                    self?.applicationSubject.send(submittedApplication)
                    self?.stateLock.unlock()
                    
                    self?.analyticsManager.track("application_submit_success", properties: [
                        "application_id": submittedApplication.id
                    ])
                },
                receiveCompletion: { [weak self] completion in
                    self?.loadingSubject.send(false)
                    
                    if case .failure(let error) = completion {
                        self?.analyticsManager.track("application_submit_error", properties: [
                            "error": error.localizedDescription
                        ])
                    }
                }
            )
            .map { _ in () }
            .mapError { $0 as! ApplicationError }
            .eraseToAnyPublisher()
    }
    
    /// Securely uploads a document with validation
    /// - Parameters:
    ///   - documentData: Document data to upload
    ///   - mimeType: MIME type of document
    ///   - documentType: Type of document being uploaded
    /// - Returns: Publisher that emits document URL or error
    public func uploadDocument(
        _ documentData: Data,
        mimeType: String,
        documentType: String
    ) -> AnyPublisher<String, ApplicationError> {
        analyticsManager.track("document_upload_started", properties: [
            "document_type": documentType,
            "mime_type": mimeType,
            "size": documentData.count
        ])
        
        loadingSubject.send(true)
        
        // Validate document before upload
        guard let application = applicationSubject.value else {
            return Fail(error: ApplicationError.invalidStatus)
                .eraseToAnyPublisher()
        }
        
        return repository.uploadDocument(applicationId: application.id, documentData: documentData, mimeType: mimeType)
            .handleEvents(
                receiveSubscription: { [weak self] _ in
                    self?.progressSubject.send(0.0)
                },
                receiveOutput: { [weak self] _ in
                    self?.progressSubject.send(1.0)
                    self?.analyticsManager.track("document_upload_success", properties: [
                        "document_type": documentType
                    ])
                },
                receiveCompletion: { [weak self] completion in
                    self?.loadingSubject.send(false)
                    
                    if case .failure(let error) = completion {
                        self?.analyticsManager.track("document_upload_error", properties: [
                            "error": error.localizedDescription
                        ])
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupErrorHandling() {
        errorSubject
            .sink { [weak self] error in
                self?.analyticsManager.track("application_error", properties: [
                    "error_type": String(describing: error),
                    "error_description": error.localizedDescription
                ])
            }
            .store(in: &cancellables)
    }
    
    private func handleSubmitApplication(_ application: Application) {
        submitApplication(application)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.errorSubject.send(error)
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func handleDocumentUpload(_ data: Data, mimeType: String, documentType: String) {
        uploadDocument(data, mimeType: mimeType, documentType: documentType)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.errorSubject.send(error)
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func handleStatusUpdate(applicationId: String, newStatus: String) {
        repository.updateApplicationStatus(applicationId, newStatus: newStatus)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.errorSubject.send(error as! ApplicationError)
                    }
                },
                receiveValue: { [weak self] updatedApplication in
                    self?.stateLock.lock()
                    self?.applicationSubject.send(updatedApplication)
                    self?.stateLock.unlock()
                }
            )
            .store(in: &cancellables)
    }
    
    private func handleValidation(_ application: Application) {
        if case .failure(let error) = application.validate() {
            errorSubject.send(error)
        }
    }
}