import UIKit
// Package version: iOS 15.0+

import Analytics
// Package version: 1.0.0

import Accessibility 
// Package version: 1.0.0

import DeepLinkHandler
// Package version: 1.0.0

/// MainCoordinator is responsible for managing the primary navigation flow of the application
/// after authentication. It handles transitions between major application sections while
/// providing support for analytics tracking, accessibility, deep linking, and state restoration.
final class MainCoordinator: Coordinator {
    
    // MARK: - Properties
    
    /// Array of child coordinators for managing sub-flows
    var childCoordinators: [Coordinator] = []
    
    /// Main navigation controller for the application flow
    var navigationController: UINavigationController
    
    /// Delegate to handle coordinator lifecycle events
    weak var delegate: MainCoordinatorDelegate?
    
    /// Analytics manager for tracking navigation and user flow events
    private let analyticsManager: AnalyticsManager
    
    /// Accessibility manager for handling voice-over and accessibility announcements
    private let accessibilityManager: AccessibilityManager
    
    /// Deep link handler for processing incoming deep links
    private let deepLinkHandler: DeepLinkHandler
    
    /// State restoration manager for preserving and restoring navigation state
    private let stateManager: StateRestorationManager
    
    // MARK: - Initialization
    
    /// Initializes the main coordinator with required dependencies
    /// - Parameters:
    ///   - navigationController: The main navigation controller
    ///   - analyticsManager: Manager for tracking analytics events
    ///   - accessibilityManager: Manager for handling accessibility features
    ///   - deepLinkHandler: Handler for processing deep links
    ///   - stateManager: Manager for state restoration
    init(
        navigationController: UINavigationController,
        analyticsManager: AnalyticsManager,
        accessibilityManager: AccessibilityManager,
        deepLinkHandler: DeepLinkHandler,
        stateManager: StateRestorationManager
    ) {
        self.navigationController = navigationController
        self.analyticsManager = analyticsManager
        self.accessibilityManager = accessibilityManager
        self.deepLinkHandler = deepLinkHandler
        self.stateManager = stateManager
        
        configureNavigationController()
    }
    
    // MARK: - Coordinator Protocol Implementation
    
    /// Starts the main application flow
    func start() {
        analyticsManager.trackEvent(.mainFlowStarted)
        
        let dashboardViewController = DashboardViewController()
        dashboardViewController.coordinator = self
        dashboardViewController.accessibilityIdentifier = "DashboardViewController"
        
        configureAccessibility(for: dashboardViewController)
        
        navigationController.setViewControllers([dashboardViewController], animated: false)
        
        stateManager.saveNavigationState(
            NavigationState(
                currentScreen: .dashboard,
                viewControllers: navigationController.viewControllers
            )
        )
    }
    
    // MARK: - Deep Linking
    
    /// Handles incoming deep links and navigates to appropriate screens
    /// - Parameter url: The deep link URL to process
    /// - Returns: Boolean indicating if the deep link was handled successfully
    @discardableResult
    func handleDeepLink(_ url: URL) -> Bool {
        guard let destination = deepLinkHandler.parse(url) else {
            analyticsManager.trackEvent(.deepLinkFailed, parameters: ["url": url.absoluteString])
            return false
        }
        
        analyticsManager.trackEvent(.deepLinkProcessed, parameters: [
            "destination": destination.rawValue
        ])
        
        switch destination {
        case .property(let id):
            navigateToProperty(withId: id)
        case .application(let id):
            navigateToApplication(withId: id)
        case .payment(let id):
            navigateToPayment(withId: id)
        }
        
        stateManager.saveNavigationState(
            NavigationState(
                currentScreen: destination,
                viewControllers: navigationController.viewControllers
            )
        )
        
        return true
    }
    
    // MARK: - State Restoration
    
    /// Restores the previous navigation state
    /// - Parameter state: The navigation state to restore
    func restoreNavigationState(_ state: NavigationState) {
        guard state.isValid else {
            analyticsManager.trackEvent(.stateRestorationFailed)
            return
        }
        
        analyticsManager.trackEvent(.stateRestorationStarted)
        
        let viewControllers = state.recreateViewControllers()
        viewControllers.forEach { configureAccessibility(for: $0) }
        
        navigationController.setViewControllers(viewControllers, animated: false)
        
        restoreChildCoordinators(for: state)
        
        analyticsManager.trackEvent(.stateRestorationCompleted)
    }
    
    // MARK: - Private Methods
    
    private func configureNavigationController() {
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.navigationBar.accessibilityIdentifier = "MainNavigationBar"
        
        if #available(iOS 15.0, *) {
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            navigationController.navigationBar.standardAppearance = appearance
            navigationController.navigationBar.scrollEdgeAppearance = appearance
        }
    }
    
    private func configureAccessibility(for viewController: UIViewController) {
        accessibilityManager.configureAnnouncements(for: viewController)
        accessibilityManager.setupVoiceOverFocus(for: viewController)
    }
    
    private func navigateToProperty(withId id: String) {
        let propertyViewController = PropertyViewController(propertyId: id)
        propertyViewController.coordinator = self
        navigationController.pushViewController(propertyViewController, animated: true)
        
        analyticsManager.trackEvent(.propertyViewed, parameters: ["property_id": id])
        accessibilityManager.announceScreenChange(to: "Property Details")
    }
    
    private func navigateToApplication(withId id: String) {
        let applicationViewController = ApplicationViewController(applicationId: id)
        applicationViewController.coordinator = self
        navigationController.pushViewController(applicationViewController, animated: true)
        
        analyticsManager.trackEvent(.applicationViewed, parameters: ["application_id": id])
        accessibilityManager.announceScreenChange(to: "Application Details")
    }
    
    private func navigateToPayment(withId id: String) {
        let paymentViewController = PaymentViewController(paymentId: id)
        paymentViewController.coordinator = self
        navigationController.pushViewController(paymentViewController, animated: true)
        
        analyticsManager.trackEvent(.paymentViewed, parameters: ["payment_id": id])
        accessibilityManager.announceScreenChange(to: "Payment Details")
    }
    
    private func restoreChildCoordinators(for state: NavigationState) {
        childCoordinators.removeAll()
        
        state.childCoordinatorStates.forEach { childState in
            let childCoordinator = createChildCoordinator(for: childState)
            childCoordinators.append(childCoordinator)
        }
    }
}

// MARK: - MainCoordinatorDelegate Protocol

/// Protocol for handling main coordinator lifecycle events
protocol MainCoordinatorDelegate: AnyObject {
    /// Called when the main coordinator has completed its flow
    func mainCoordinatorDidFinish(_ coordinator: MainCoordinator)
    
    /// Called when an error occurs during navigation
    func mainCoordinator(_ coordinator: MainCoordinator, didEncounterError error: Error)
}