//
// ApplicationRepository.swift
// ProjectX
//
// Enterprise-grade repository coordinating application data operations between remote API and local storage
// Version: iOS 15.0+
//

import Foundation
import Combine
import CoreData
import os.log

/// Thread-safe repository class that manages application data operations with comprehensive error handling,
/// monitoring, and offline support
public final class ApplicationRepository {
    
    // MARK: - Properties
    
    private let applicationService: ApplicationService
    private let coreDataManager: CoreDataManager
    private let operationLock = NSLock()
    private let logger = Logger(subsystem: "com.projectx.applicationrepository", category: "data")
    private var cancellables = Set<AnyCancellable>()
    
    /// Queue for handling background sync operations
    private let syncQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .utility
        return queue
    }()
    
    // MARK: - Initialization
    
    /// Initializes repository with required dependencies
    /// - Parameters:
    ///   - applicationService: Service for remote API operations
    ///   - coreDataManager: Manager for local data persistence
    public init(applicationService: ApplicationService,
                coreDataManager: CoreDataManager = .shared) {
        self.applicationService = applicationService
        self.coreDataManager = coreDataManager
        
        setupBackgroundSync()
        logger.info("ApplicationRepository initialized")
    }
    
    // MARK: - Public Methods
    
    /// Submits a new rental application with validation and persistence
    /// - Parameter application: Application to submit
    /// - Returns: Publisher that emits submitted application or detailed error
    public func submitApplication(_ application: Application) -> AnyPublisher<Application, Error> {
        logger.info("Submitting application: \(application.id)")
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(ApplicationError.concurrencyError))
                return
            }
            
            self.operationLock.lock()
            defer { self.operationLock.unlock() }
            
            // Validate application data
            guard case .success = application.validate() else {
                self.logger.error("Application validation failed: \(application.id)")
                promise(.failure(ApplicationError.invalidStatus))
                return
            }
            
            // Start with local persistence
            self.coreDataManager.performBackgroundTask { context in
                do {
                    let entity = application.toEntity(in: context)
                    entity.syncStatus = "pending"
                    
                    if case .failure(let error) = self.coreDataManager.saveContext(context) {
                        self.logger.error("Failed to save application locally: \(error.localizedDescription)")
                        promise(.failure(error))
                        return
                    }
                    
                    // Attempt remote submission
                    self.applicationService.submitApplication(application)
                        .receive(on: DispatchQueue.main)
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    self.logger.error("Remote submission failed: \(error.localizedDescription)")
                                    promise(.failure(error))
                                }
                            },
                            receiveValue: { submittedApplication in
                                // Update local entity with remote data
                                self.coreDataManager.performBackgroundTask { context in
                                    let entity = submittedApplication.toEntity(in: context)
                                    entity.syncStatus = "synced"
                                    
                                    if case .failure(let error) = self.coreDataManager.saveContext(context) {
                                        self.logger.error("Failed to update local application: \(error.localizedDescription)")
                                        promise(.failure(error))
                                        return
                                    }
                                    
                                    self.logger.info("Application submitted successfully: \(submittedApplication.id)")
                                    promise(.success(submittedApplication))
                                }
                            }
                        )
                        .store(in: &self.cancellables)
                } catch {
                    self.logger.error("Failed to create application entity: \(error.localizedDescription)")
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Retrieves application by ID with offline support
    /// - Parameter applicationId: ID of application to retrieve
    /// - Returns: Publisher that emits application or detailed error
    public func getApplication(_ applicationId: String) -> AnyPublisher<Application, Error> {
        logger.info("Retrieving application: \(applicationId)")
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(ApplicationError.concurrencyError))
                return
            }
            
            // First check local storage
            self.coreDataManager.performBackgroundTask { context in
                let fetchRequest: NSFetchRequest<ApplicationEntity> = ApplicationEntity.fetchRequest()
                fetchRequest.predicate = NSPredicate(format: "id == %@", applicationId)
                
                do {
                    if let entity = try context.fetch(fetchRequest).first {
                        let application = try Application.fromEntity(entity)
                        
                        // Attempt to refresh from remote if online
                        self.applicationService.getApplicationStatus(applicationId)
                            .receive(on: DispatchQueue.main)
                            .sink(
                                receiveCompletion: { _ in
                                    // Return local data even if remote fetch fails
                                    promise(.success(application))
                                },
                                receiveValue: { updatedApplication in
                                    // Update local storage with fresh data
                                    self.coreDataManager.performBackgroundTask { context in
                                        let entity = updatedApplication.toEntity(in: context)
                                        entity.syncStatus = "synced"
                                        _ = self.coreDataManager.saveContext(context)
                                    }
                                    promise(.success(updatedApplication))
                                }
                            )
                            .store(in: &self.cancellables)
                    } else {
                        // Not found locally, try remote
                        self.applicationService.getApplicationStatus(applicationId)
                            .receive(on: DispatchQueue.main)
                            .sink(
                                receiveCompletion: { completion in
                                    if case .failure(let error) = completion {
                                        self.logger.error("Failed to fetch application: \(error.localizedDescription)")
                                        promise(.failure(error))
                                    }
                                },
                                receiveValue: { application in
                                    // Cache fetched application
                                    self.coreDataManager.performBackgroundTask { context in
                                        let entity = application.toEntity(in: context)
                                        entity.syncStatus = "synced"
                                        _ = self.coreDataManager.saveContext(context)
                                    }
                                    promise(.success(application))
                                }
                            )
                            .store(in: &self.cancellables)
                    }
                } catch {
                    self.logger.error("Failed to fetch application: \(error.localizedDescription)")
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Updates application status with offline support
    /// - Parameters:
    ///   - applicationId: ID of application to update
    ///   - newStatus: New status to set
    /// - Returns: Publisher that emits updated application or detailed error
    public func updateApplicationStatus(_ applicationId: String, newStatus: String) -> AnyPublisher<Application, Error> {
        logger.info("Updating application status: \(applicationId) to \(newStatus)")
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(ApplicationError.concurrencyError))
                return
            }
            
            self.operationLock.lock()
            defer { self.operationLock.unlock() }
            
            // Update local first
            self.coreDataManager.performBackgroundTask { context in
                let fetchRequest: NSFetchRequest<ApplicationEntity> = ApplicationEntity.fetchRequest()
                fetchRequest.predicate = NSPredicate(format: "id == %@", applicationId)
                
                do {
                    guard let entity = try context.fetch(fetchRequest).first else {
                        promise(.failure(ApplicationError.invalidStatus))
                        return
                    }
                    
                    entity.updateStatus(newStatus)
                    entity.syncStatus = "pending"
                    
                    if case .failure(let error) = self.coreDataManager.saveContext(context) {
                        promise(.failure(error))
                        return
                    }
                    
                    // Attempt remote update
                    self.applicationService.updateApplicationStatus(applicationId, newStatus: newStatus)
                        .receive(on: DispatchQueue.main)
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    self.logger.error("Failed to update remote status: \(error.localizedDescription)")
                                    promise(.failure(error))
                                }
                            },
                            receiveValue: { updatedApplication in
                                // Update local with confirmed data
                                self.coreDataManager.performBackgroundTask { context in
                                    let entity = updatedApplication.toEntity(in: context)
                                    entity.syncStatus = "synced"
                                    _ = self.coreDataManager.saveContext(context)
                                }
                                promise(.success(updatedApplication))
                            }
                        )
                        .store(in: &self.cancellables)
                    
                } catch {
                    self.logger.error("Failed to update application status: \(error.localizedDescription)")
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupBackgroundSync() {
        // Schedule periodic sync of pending changes
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.syncPendingChanges()
        }
    }
    
    private func syncPendingChanges() {
        syncQueue.addOperation { [weak self] in
            guard let self = self else { return }
            
            self.coreDataManager.performBackgroundTask { context in
                let fetchRequest: NSFetchRequest<ApplicationEntity> = ApplicationEntity.fetchRequest()
                fetchRequest.predicate = NSPredicate(format: "syncStatus == %@", "pending")
                
                do {
                    let pendingEntities = try context.fetch(fetchRequest)
                    
                    for entity in pendingEntities {
                        guard let application = try? Application.fromEntity(entity) else { continue }
                        
                        // Attempt to sync with remote
                        self.applicationService.submitApplication(application)
                            .sink(
                                receiveCompletion: { _ in },
                                receiveValue: { _ in
                                    entity.syncStatus = "synced"
                                    _ = self.coreDataManager.saveContext(context)
                                }
                            )
                            .store(in: &self.cancellables)
                    }
                } catch {
                    self.logger.error("Background sync failed: \(error.localizedDescription)")
                }
            }
        }
    }
}