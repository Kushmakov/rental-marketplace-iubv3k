import UIKit

/// Protocol that provides a standardized way to instantiate view controllers from storyboards.
/// Supports MVVM architecture and Coordinator pattern with enhanced error handling.
protocol Storyboarded: AnyObject {
    /// Optional property to specify a custom storyboard name.
    /// If not provided, the type name will be used as the storyboard name.
    static var storyboardName: String { get }
    
    /// Optional property to specify a custom storyboard identifier.
    /// If not provided, the type name will be used as the identifier.
    static var storyboardIdentifier: String { get }
    
    /// Creates an instance of a view controller from its storyboard.
    /// - Returns: Instance of the view controller conforming to this protocol.
    /// - Throws: StoryboardError if instantiation fails.
    static func instantiate() throws -> Self
}

/// Errors that can occur during storyboard instantiation
enum StoryboardError: LocalizedError {
    case storyboardNotFound(name: String)
    case invalidIdentifier(id: String)
    case invalidViewControllerType
    
    var errorDescription: String? {
        switch self {
        case .storyboardNotFound(let name):
            return "Storyboard not found: \(name)"
        case .invalidIdentifier(let id):
            return "Invalid storyboard identifier: \(id)"
        case .invalidViewControllerType:
            return "Failed to cast view controller to expected type"
        }
    }
}

extension Storyboarded where Self: UIViewController {
    static var storyboardName: String {
        // Default implementation uses the type name as storyboard name
        return String(describing: self)
    }
    
    static var storyboardIdentifier: String {
        // Default implementation uses the type name as identifier
        return String(describing: self)
    }
    
    static func instantiate() throws -> Self {
        // Get the storyboard name, either from custom implementation or default
        let name = storyboardName
        
        // Initialize storyboard with proper error handling
        guard let storyboard = UIStoryboard(name: name, bundle: nil) else {
            throw StoryboardError.storyboardNotFound(name: name)
        }
        
        // Get the identifier, either from custom implementation or default
        let identifier = storyboardIdentifier
        
        // Attempt to instantiate the view controller
        guard let viewController = storyboard.instantiateViewController(withIdentifier: identifier) as? Self else {
            // If casting fails, determine which error occurred
            if storyboard.instantiateViewController(withIdentifier: identifier) != nil {
                throw StoryboardError.invalidViewControllerType
            } else {
                throw StoryboardError.invalidIdentifier(id: identifier)
            }
        }
        
        return viewController
    }
}

// MARK: - Debug Support
extension StoryboardError {
    /// Provides detailed debugging information for storyboard errors
    var debugDescription: String {
        switch self {
        case .storyboardNotFound(let name):
            return """
            Storyboard Not Found Error:
            - Attempted to load storyboard named: \(name)
            - Verify the storyboard file exists in the main bundle
            - Check for correct capitalization and spelling
            """
        case .invalidIdentifier(let id):
            return """
            Invalid Storyboard Identifier Error:
            - Attempted to use identifier: \(id)
            - Verify the identifier is set in the storyboard
            - Check for correct capitalization and spelling
            - Ensure the view controller has a Storyboard ID set
            """
        case .invalidViewControllerType:
            return """
            Invalid View Controller Type Error:
            - Failed to cast the instantiated view controller to the expected type
            - Verify the view controller class in storyboard matches the expected type
            - Check for correct class module settings in storyboard
            """
        }
    }
}