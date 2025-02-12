import UIKit

/// Protocol defining the interface for auth coordinator delegate
public protocol AuthCoordinatorDelegate: AnyObject {
    func authCoordinatorDidComplete(_ coordinator: AuthCoordinator)
    func authCoordinatorDidFail(_ coordinator: AuthCoordinator, with error: Error)
}

/// Coordinator responsible for managing authentication flow navigation with enhanced security and state management
public final class AuthCoordinator: Coordinator {
    
    // MARK: - Properties
    
    public var childCoordinators: [Coordinator] = []
    public var navigationController: UINavigationController
    public weak var delegate: AuthCoordinatorDelegate?
    
    /// Dedicated serial queue for thread-safe navigation transitions
    private let secureTransitionQueue: DispatchQueue
    
    /// View model factory for dependency injection
    private let viewModelFactory: ViewModelFactory
    
    /// State tracking for navigation security
    private var isTransitioning: Bool = false
    
    // MARK: - Initialization
    
    public init(navigationController: UINavigationController, viewModelFactory: ViewModelFactory) {
        self.navigationController = navigationController
        self.viewModelFactory = viewModelFactory
        self.secureTransitionQueue = DispatchQueue(
            label: "com.projectx.auth.transitions",
            qos: .userInitiated
        )
        
        // Configure navigation controller security settings
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.setNavigationBarHidden(false, animated: false)
        
        // Prevent screenshot/recording for security
        navigationController.view.makeSecure()
    }
    
    // MARK: - Coordinator Protocol
    
    public func start() {
        showLogin()
    }
    
    // MARK: - Navigation Methods
    
    /// Shows the login screen with thread-safe transition
    private func showLogin() {
        secureTransitionQueue.async { [weak self] in
            guard let self = self, !self.isTransitioning else { return }
            self.isTransitioning = true
            
            DispatchQueue.main.async {
                // Create login view model with dependencies
                let loginViewModel = self.viewModelFactory.makeLoginViewModel()
                
                // Initialize login view controller
                let loginVC = LoginViewController(viewModel: loginViewModel)
                
                // Configure navigation item
                loginVC.navigationItem.largeTitleDisplayMode = .always
                loginVC.navigationItem.rightBarButtonItem = UIBarButtonItem(
                    title: NSLocalizedString("Sign Up", comment: ""),
                    style: .plain,
                    target: self,
                    action: #selector(self.handleSignupTapped)
                )
                
                // Set as root with fade transition
                self.navigationController.setViewControllers([loginVC], animated: true)
                self.isTransitioning = false
            }
        }
    }
    
    /// Shows the signup screen with secure state management
    private func showSignup() {
        secureTransitionQueue.async { [weak self] in
            guard let self = self, !self.isTransitioning else { return }
            self.isTransitioning = true
            
            DispatchQueue.main.async {
                // Create signup view model with dependencies
                let signupViewModel = self.viewModelFactory.makeSignupViewModel()
                
                // Initialize signup view controller
                let signupVC = SignupViewController(viewModel: signupViewModel)
                
                // Configure navigation
                signupVC.navigationItem.largeTitleDisplayMode = .always
                
                // Push with slide transition
                self.navigationController.pushViewController(signupVC, animated: true)
                self.isTransitioning = false
            }
        }
    }
    
    // MARK: - Action Handlers
    
    @objc private func handleSignupTapped() {
        showSignup()
    }
    
    /// Handles successful authentication with secure cleanup
    private func handleAuthenticationSuccess() {
        secureTransitionQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Clear sensitive data
            self.childCoordinators.removeAll()
            
            DispatchQueue.main.async {
                // Notify delegate of completion
                self.delegate?.authCoordinatorDidComplete(self)
            }
        }
    }
    
    /// Handles authentication failure with error propagation
    private func handleAuthenticationFailure(_ error: Error) {
        secureTransitionQueue.async { [weak self] in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                // Notify delegate of failure
                self.delegate?.authCoordinatorDidFail(self, with: error)
            }
        }
    }
}

// MARK: - View Security Extension

private extension UIView {
    func makeSecure() {
        DispatchQueue.main.async {
            self.isSecureTextEntry = true
            
            #if DEBUG
            // Allow screenshots in debug builds
            #else
            // Prevent screenshots in release builds
            let field = UITextField()
            field.isSecureTextEntry = true
            self.addSubview(field)
            field.centerYAnchor.constraint(equalTo: self.centerYAnchor).isActive = true
            field.centerXAnchor.constraint(equalTo: self.centerXAnchor).isActive = true
            self.layer.superlayer?.allowsGroupOpacity = false
            #endif
        }
    }
}