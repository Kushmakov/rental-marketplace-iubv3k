import UIKit

/// Protocol that defines the core functionality required for navigation coordination and flow management
/// in the application. Implements the Coordinator pattern to centralize navigation logic and reduce
/// view controller coupling.
///
/// The Coordinator pattern helps to:
/// - Decouple view controllers from each other
/// - Centralize navigation logic
/// - Support complex navigation flows
/// - Manage memory effectively through proper child coordinator handling
protocol Coordinator: AnyObject {
    
    /// Array to store and manage child coordinators for nested navigation flows.
    /// Must be mutable to allow dynamic addition and removal of child coordinators during runtime.
    /// Responsible for maintaining the coordinator hierarchy and preventing memory leaks.
    var childCoordinators: [Coordinator] { get set }
    
    /// The navigation controller used for managing view controller hierarchy.
    /// Strong reference to ensure the navigation controller remains active throughout the coordinator's lifecycle.
    /// Responsible for handling view controller transitions and maintaining the navigation stack.
    var navigationController: UINavigationController { get set }
    
    /// Initiates the coordinator's navigation flow.
    /// This method is called to begin the coordinator's responsibility for managing its assigned navigation flow.
    /// Must be implemented by conforming types to set up initial view controllers and establish
    /// the starting point of the navigation sequence.
    func start()
}