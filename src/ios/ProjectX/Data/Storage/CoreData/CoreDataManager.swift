import CoreData
import Foundation

/// CoreDataManager: Thread-safe singleton class managing Core Data stack with enhanced error handling,
/// performance monitoring, and automatic cleanup
/// Version: iOS SDK 14.0+
public final class CoreDataManager {
    
    // MARK: - Constants
    private enum Constants {
        static let modelName = "ProjectX"
        static let maxStorageSize = 500 * 1024 * 1024 // 500MB
        static let defaultBatchSize = 100
        static let storeURL = "ProjectX.sqlite"
        static let backgroundQueueLabel = "com.projectx.coredata.background"
    }
    
    // MARK: - Properties
    
    /// Shared instance for singleton access
    public static let shared = CoreDataManager()
    
    /// Persistent container managing the Core Data stack
    private lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: Constants.modelName)
        
        // Configure store options
        let storeDescription = container.persistentStoreDescriptions.first
        storeDescription?.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)
        storeDescription?.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
        
        // Configure store with SQLite options
        let options = [
            NSMigratePersistentStoresAutomaticallyOption: true,
            NSInferMappingModelAutomaticallyOption: true,
            NSSQLitePragmasOption: ["journal_mode": "WAL"]
        ]
        storeDescription?.options = options
        
        container.loadPersistentStores { [weak self] description, error in
            if let error = error {
                fatalError("Core Data store failed to load: \(error.localizedDescription)")
            }
            self?.setupContainer(container)
        }
        
        return container
    }()
    
    /// Main context for UI operations
    public var viewContext: NSManagedObjectContext {
        return persistentContainer.viewContext
    }
    
    /// Background context for data operations
    private lazy var backgroundContext: NSManagedObjectContext = {
        let context = persistentContainer.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        context.automaticallyMergesChangesFromParent = true
        return context
    }()
    
    /// Queue for background operations
    private lazy var backgroundQueue: DispatchQueue = {
        return DispatchQueue(label: Constants.backgroundQueueLabel, qos: .utility)
    }()
    
    /// Performance metrics tracking
    private var metrics: StorageMetrics = StorageMetrics()
    
    // MARK: - Initialization
    
    private init() {
        setupNotifications()
    }
    
    // MARK: - Setup Methods
    
    private func setupContainer(_ container: NSPersistentContainer) {
        // Configure view context
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        container.viewContext.shouldDeleteInaccessibleFaults = true
        
        // Set up automatic batch size
        container.viewContext.undoManager = nil
        container.viewContext.shouldDeleteInaccessibleFaults = true
    }
    
    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(managedObjectContextDidSave(_:)),
            name: .NSManagedObjectContextDidSave,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Saves changes in the specified context with error handling and performance tracking
    /// - Parameter context: The NSManagedObjectContext to save
    /// - Returns: Result indicating success or failure with error details
    @discardableResult
    public func saveContext(_ context: NSManagedObjectContext) -> Result<Void, Error> {
        guard context.hasChanges else { return .success(()) }
        
        let startTime = CFAbsoluteTimeGetCurrent()
        
        do {
            try context.obtainPermanentIDs(for: Array(context.insertedObjects))
            try context.save()
            
            metrics.recordSaveOperation(duration: CFAbsoluteTimeGetCurrent() - startTime)
            return .success(())
        } catch {
            metrics.recordError()
            return .failure(error)
        }
    }
    
    /// Executes task in background context with monitoring
    /// - Parameter block: The block to execute
    public func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        backgroundQueue.async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            self.backgroundContext.performAndWait {
                block(self.backgroundContext)
                
                if self.backgroundContext.hasChanges {
                    _ = self.saveContext(self.backgroundContext)
                }
            }
            
            self.metrics.recordBackgroundOperation(duration: CFAbsoluteTimeGetCurrent() - startTime)
        }
    }
    
    /// Safely clears all data with validation
    /// - Returns: Result indicating success or failure
    public func clearStorage() -> Result<Void, Error> {
        let startTime = CFAbsoluteTimeGetCurrent()
        
        var clearError: Error?
        backgroundContext.performAndWait {
            let entityNames = self.persistentContainer.managedObjectModel.entities.map { $0.name ?? "" }
            
            for entityName in entityNames {
                let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: entityName)
                let batchDeleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)
                batchDeleteRequest.resultType = .resultTypeObjectIDs
                
                do {
                    let result = try backgroundContext.execute(batchDeleteRequest) as? NSBatchDeleteResult
                    if let objectIDs = result?.result as? [NSManagedObjectID] {
                        NSManagedObjectContext.mergeChanges(
                            fromRemoteContextSave: [NSDeletedObjectsKey: objectIDs],
                            into: [viewContext]
                        )
                    }
                } catch {
                    clearError = error
                    break
                }
            }
        }
        
        metrics.recordClearOperation(duration: CFAbsoluteTimeGetCurrent() - startTime)
        
        if let error = clearError {
            return .failure(error)
        }
        
        return .success(())
    }
    
    // MARK: - Notification Handlers
    
    @objc private func managedObjectContextDidSave(_ notification: Notification) {
        guard let context = notification.object as? NSManagedObjectContext else { return }
        
        if context === backgroundContext {
            viewContext.perform { [weak self] in
                self?.viewContext.mergeChanges(fromContextDidSave: notification)
            }
        }
    }
    
    @objc private func handleMemoryWarning() {
        backgroundQueue.async { [weak self] in
            self?.persistentContainer.persistentStoreCoordinator.managedObjectContexts.forEach { context in
                context.refreshAllObjects()
            }
        }
    }
}

// MARK: - StorageMetrics

private struct StorageMetrics {
    private var saveOperations: Int = 0
    private var totalSaveTime: TimeInterval = 0
    private var errorCount: Int = 0
    private var backgroundOperations: Int = 0
    private var totalBackgroundTime: TimeInterval = 0
    
    mutating func recordSaveOperation(duration: TimeInterval) {
        saveOperations += 1
        totalSaveTime += duration
    }
    
    mutating func recordBackgroundOperation(duration: TimeInterval) {
        backgroundOperations += 1
        totalBackgroundTime += duration
    }
    
    mutating func recordError() {
        errorCount += 1
    }
    
    mutating func recordClearOperation(duration: TimeInterval) {
        // Record cleanup metrics
    }
}