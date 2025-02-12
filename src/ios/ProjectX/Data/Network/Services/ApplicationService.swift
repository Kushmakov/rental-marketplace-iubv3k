//
// ApplicationService.swift
// ProjectX
//
// Enhanced service class for rental application network operations with security and monitoring
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// Security version: iOS 15.0+
//

import Foundation
import Combine
import os.log
import Security

/// Service class that handles all rental application-related network operations with enhanced security and monitoring
public final class ApplicationService {
    
    // MARK: - Properties
    
    private let apiClient: APIClient
    private let statusLock = NSLock()
    private let logger = Logger(subsystem: "com.projectx.applicationservice", category: "network")
    
    // MARK: - Constants
    
    private enum Constants {
        static let maxDocumentSize = 10 * 1024 * 1024 // 10MB
        static let allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"]
        static let maxRetries = 3
        static let documentUploadTimeout: TimeInterval = 300 // 5 minutes
    }
    
    // MARK: - Initialization
    
    public init() {
        self.apiClient = APIClient.shared
        
        logger.info("ApplicationService initialized")
    }
    
    // MARK: - Public Methods
    
    /// Securely submits a new rental application with validation and monitoring
    /// - Parameter application: Application instance to submit
    /// - Returns: Publisher that emits submitted application or detailed error
    public func submitApplication(_ application: Application) -> AnyPublisher<Application, Error> {
        logger.info("Submitting application: \(application.id)")
        
        // Validate application data
        guard case .success = application.validate() else {
            logger.error("Application validation failed: \(application.id)")
            return Fail(error: ApplicationError.invalidStatus)
                .eraseToAnyPublisher()
        }
        
        // Monitor request initiation
        apiClient.monitor("application_submit", properties: [
            "application_id": application.id,
            "property_id": application.property.id
        ])
        
        return apiClient.request(
            APIEndpoint.applications.submit,
            parameters: application,
            priority: .high
        )
        .handleEvents(
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                
                switch completion {
                case .finished:
                    self.logger.info("Application submission completed: \(application.id)")
                case .failure(let error):
                    self.logger.error("Application submission failed: \(error.localizedDescription)")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    /// Securely uploads a document for an application with validation
    /// - Parameters:
    ///   - applicationId: ID of the application
    ///   - documentData: Document data to upload
    ///   - mimeType: MIME type of the document
    /// - Returns: Publisher that emits document URL or detailed error
    public func uploadDocument(
        applicationId: String,
        documentData: Data,
        mimeType: String
    ) -> AnyPublisher<String, Error> {
        logger.info("Uploading document for application: \(applicationId)")
        
        // Validate document size
        guard documentData.count <= Constants.maxDocumentSize else {
            logger.error("Document size exceeds limit: \(documentData.count) bytes")
            return Fail(error: ApplicationError.documentError)
                .eraseToAnyPublisher()
        }
        
        // Validate mime type
        guard Constants.allowedMimeTypes.contains(mimeType) else {
            logger.error("Invalid document mime type: \(mimeType)")
            return Fail(error: ApplicationError.documentError)
                .eraseToAnyPublisher()
        }
        
        // Monitor upload initiation
        apiClient.monitor("document_upload", properties: [
            "application_id": applicationId,
            "mime_type": mimeType,
            "size": documentData.count
        ])
        
        return apiClient.upload(
            to: APIEndpoint.applications.uploadDocument(applicationId),
            fileData: documentData,
            mimeType: mimeType,
            priority: .default
        )
        .timeout(Constants.documentUploadTimeout, scheduler: DispatchQueue.global())
        .map { response in
            return response.url.absoluteString
        }
        .handleEvents(
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                
                switch completion {
                case .finished:
                    self.logger.info("Document upload completed for application: \(applicationId)")
                case .failure(let error):
                    self.logger.error("Document upload failed: \(error.localizedDescription)")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    /// Retrieves current status of an application with monitoring
    /// - Parameter applicationId: ID of the application to check
    /// - Returns: Publisher that emits application with status or detailed error
    public func getApplicationStatus(_ applicationId: String) -> AnyPublisher<Application, Error> {
        logger.info("Fetching status for application: \(applicationId)")
        
        return apiClient.request(
            APIEndpoint.applications.status(applicationId),
            priority: .default
        )
        .handleEvents(
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                
                switch completion {
                case .finished:
                    self.logger.info("Status fetch completed for application: \(applicationId)")
                case .failure(let error):
                    self.logger.error("Status fetch failed: \(error.localizedDescription)")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    /// Thread-safe update of application status with validation
    /// - Parameters:
    ///   - applicationId: ID of the application to update
    ///   - newStatus: New status to set
    /// - Returns: Publisher that emits updated application or detailed error
    public func updateApplicationStatus(
        _ applicationId: String,
        newStatus: String
    ) -> AnyPublisher<Application, Error> {
        logger.info("Updating status for application: \(applicationId) to: \(newStatus)")
        
        statusLock.lock()
        defer { statusLock.unlock() }
        
        // Monitor status update
        apiClient.monitor("status_update", properties: [
            "application_id": applicationId,
            "new_status": newStatus
        ])
        
        return apiClient.request(
            APIEndpoint.applications.updateStatus(applicationId),
            parameters: ["status": newStatus],
            priority: .high
        )
        .handleEvents(
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                
                switch completion {
                case .finished:
                    self.logger.info("Status update completed for application: \(applicationId)")
                case .failure(let error):
                    self.logger.error("Status update failed: \(error.localizedDescription)")
                }
            }
        )
        .eraseToAnyPublisher()
    }
}