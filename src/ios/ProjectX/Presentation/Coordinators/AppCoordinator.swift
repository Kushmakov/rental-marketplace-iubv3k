import UIKit

/// Root coordinator responsible for managing the overall application navigation flow.
/// Handles transitions between authentication and main application states with proper
/// memory management and state cleanup.
final class AppCoordinator: Coordinator {
    
    // MARK: - Properties
    
    /// Array of child coordinators for managing sub-flows
    var childCoordinators: [Coordinator] = []
    
    /// Main navigation controller for the application
    var navigationController: UINavigationController
    
    /// Reference to the main application window
    private let window: UIWindow
    
    /// Reference to the authentication coordinator when active
    private var authCoordinator: AuthCoordinator?
    
    /// Reference to the main flow coordinator when active
    private var mainCoordinator: MainCoordinator?
    
    /// Default transition animation for flow changes
    private lazy var transition: CATransition = {
        let transition = CATransition()
        transition.duration = 0.3
        transition.type = .fade
        transition.subtype = .fromRight
        return transition
    }()
    
    // MARK: - Initialization
    
    /// Initializes the AppCoordinator with the main application window
    /// - Parameter window: The main application window
    init(window: UIWindow) {
        self.window = window
        
        // Configure navigation controller with default settings
        let navController = UINavigationController()
        navController.navigationBar.prefersLargeTitles = true
        navController.navigationBar.tintColor = .systemBlue
        
        // Configure default navigation appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = .systemBackground
        navController.navigationBar.standardAppearance = appearance
        navController.navigationBar.scrollEdgeAppearance = appearance
        
        self.navigationController = navController
        self.window.rootViewController = navigationController
    }
    
    // MARK: - Coordinator Methods
    
    /// Starts the application flow by checking authentication state
    func start() {
        // Check authentication state on main thread
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            if AuthenticationManager.shared.isAuthenticated {
                self.showMainFlow()
            } else {
                self.showAuthFlow()
            }
            
            // Make window visible and key
            self.window.makeKeyAndVisible()
        }
    }
    
    // MARK: - Flow Management
    
    /// Shows the authentication flow with proper state management
    private func showAuthFlow() {
        // Create and configure auth coordinator
        let authCoordinator = AuthCoordinator(navigationController: navigationController)
        
        // Set completion handler for successful authentication
        authCoordinator.onAuthenticationComplete = { [weak self] in
            self?.handleAuthenticationComplete()
        }
        
        // Store reference and start flow
        self.authCoordinator = authCoordinator
        childCoordinators.append(authCoordinator)
        
        // Configure transition animation
        navigationController.view.layer.add(transition, forKey: nil)
        
        // Start auth flow
        authCoordinator.start()
        
        // Update navigation bar for auth flow
        navigationController.setNavigationBarHidden(true, animated: false)
    }
    
    /// Shows the main application flow with proper state cleanup
    private func showMainFlow() {
        // Create and configure main coordinator
        let mainCoordinator = MainCoordinator(navigationController: navigationController)
        
        // Set logout handler
        mainCoordinator.onLogout = { [weak self] in
            self?.handleLogout()
        }
        
        // Store reference and start flow
        self.mainCoordinator = mainCoordinator
        childCoordinators.append(mainCoordinator)
        
        // Configure transition animation
        navigationController.view.layer.add(transition, forKey: nil)
        
        // Start main flow
        mainCoordinator.start()
        
        // Update navigation bar for main flow
        navigationController.setNavigationBarHidden(false, animated: false)
    }
    
    // MARK: - State Management
    
    /// Handles successful authentication completion
    private func handleAuthenticationComplete() {
        // Remove auth coordinator
        if let index = childCoordinators.firstIndex(where: { $0 === authCoordinator }) {
            childCoordinators.remove(at: index)
        }
        
        // Clear reference and perform cleanup
        authCoordinator = nil
        
        // Show main flow
        showMainFlow()
    }
    
    /// Handles user logout
    private func handleLogout() {
        // Remove main coordinator
        if let index = childCoordinators.firstIndex(where: { $0 === mainCoordinator }) {
            childCoordinators.remove(at: index)
        }
        
        // Clear reference and perform cleanup
        mainCoordinator = nil
        
        // Show auth flow
        showAuthFlow()
    }
}