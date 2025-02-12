//
// AppDelegate.swift
// ProjectX
//
// Main application delegate managing core application lifecycle and system integration
// Foundation version: iOS 13.0+
//

import UIKit
import CoreData
import Stripe // v23.0.0

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    // MARK: - Properties
    
    /// CoreData persistent container for data management
    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "ProjectX")
        container.loadPersistentStores { description, error in
            if let error = error {
                Logger.shared.log(.error, "Failed to load CoreData store: \(error.localizedDescription)")
                fatalError("Unresolved CoreData error: \(error)")
            }
        }
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        return container
    }()
    
    /// Background queue for asynchronous operations
    private let backgroundQueue = DispatchQueue(label: "com.projectx.background", qos: .utility)
    
    /// Flag indicating successful initialization
    private(set) var isInitialized: Bool = false
    
    // MARK: - Application Lifecycle
    
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Configure logging system
        configureLogging()
        
        // Initialize CoreData stack
        initializeCoreData()
        
        // Configure Stripe SDK
        configureStripeSDK()
        
        // Configure appearance
        configureAppearance()
        
        // Register for push notifications
        registerForPushNotifications(application)
        
        // Configure background task handling
        configureBackgroundTasks()
        
        // Set up security
        configureSecurity()
        
        isInitialized = true
        Logger.shared.log(.info, "Application successfully initialized")
        
        return true
    }
    
    func applicationWillTerminate(_ application: UIApplication) {
        saveContext()
        cleanupBackgroundTasks()
        performSecurityCleanup()
        Logger.shared.log(.info, "Application will terminate")
    }
    
    // MARK: - Push Notifications
    
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Logger.shared.log(.debug, "Registered for push notifications with token: \(tokenString)")
    }
    
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Logger.shared.log(.error, "Failed to register for push notifications: \(error.localizedDescription)")
    }
    
    // MARK: - Core Data
    
    /// Saves the managed object context if changes exist
    func saveContext() {
        let context = persistentContainer.viewContext
        if context.hasChanges {
            do {
                try context.save()
                Logger.shared.log(.debug, "CoreData context saved successfully")
            } catch {
                Logger.shared.logError("Failed to save CoreData context: \(error)")
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func configureLogging() {
        #if DEBUG
        Logger.shared.log(.debug, "Configured logging for DEBUG environment")
        #else
        Logger.shared.log(.info, "Configured logging for RELEASE environment")
        #endif
    }
    
    private func initializeCoreData() {
        backgroundQueue.async { [weak self] in
            self?.persistentContainer.viewContext.automaticallyMergesChangesFromParent = true
            Logger.shared.log(.debug, "CoreData stack initialized")
        }
    }
    
    private func configureStripeSDK() {
        guard let stripeKey = Bundle.main.object(forInfoDictionaryKey: "STRIPE_PUBLISHABLE_KEY") as? String else {
            Logger.shared.logError("Missing Stripe publishable key")
            return
        }
        StripeAPI.defaultPublishableKey = stripeKey
        Logger.shared.log(.debug, "Stripe SDK configured")
    }
    
    private func configureAppearance() {
        if #available(iOS 15.0, *) {
            let navigationBarAppearance = UINavigationBarAppearance()
            navigationBarAppearance.configureWithOpaqueBackground()
            UINavigationBar.appearance().standardAppearance = navigationBarAppearance
            UINavigationBar.appearance().scrollEdgeAppearance = navigationBarAppearance
        }
    }
    
    private func registerForPushNotifications(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                Logger.shared.logError("Push notification authorization failed: \(error)")
                return
            }
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
    }
    
    private func configureBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.projectx.refresh",
            using: nil
        ) { task in
            self.handleBackgroundTask(task as! BGAppRefreshTask)
        }
    }
    
    private func configureSecurity() {
        // Configure app transport security
        if #available(iOS 15.0, *) {
            URLSession.shared.configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
        }
        
        // Enable data protection
        let fileManager = FileManager.default
        if let documentPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? fileManager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: documentPath.path)
        }
    }
    
    private func cleanupBackgroundTasks() {
        BGTaskScheduler.shared.cancelAllTaskRequests()
    }
    
    private func performSecurityCleanup() {
        // Clear sensitive data from memory
        persistentContainer.viewContext.refreshAllObjects()
        URLCache.shared.removeAllCachedResponses()
    }
    
    private func handleBackgroundTask(_ task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        
        // Implement background refresh logic here
        backgroundQueue.async {
            // Perform background operations
            task.setTaskCompleted(success: true)
        }
    }
}