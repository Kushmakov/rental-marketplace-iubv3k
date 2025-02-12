import Foundation
import Combine  // iOS 15.0+

/// Protocol defining the core contract for view models in the MVVM architecture.
///
/// ViewModelType provides a standardized way to implement view models with type-safe input/output
/// data flow using Combine framework for reactive programming.
///
/// - Note: Conforming types should properly manage memory by storing cancellables and handling cleanup
/// - Warning: Transform function must handle all possible input cases and ensure thread safety
///
/// Example implementation:
/// ```
/// final class LoginViewModel: ViewModelType {
///     struct Input {
///         let emailInput: AnyPublisher<String, Never>
///         let passwordInput: AnyPublisher<String, Never>
///         let loginTapped: AnyPublisher<Void, Never>
///     }
///
///     struct Output {
///         let isEmailValid: AnyPublisher<Bool, Never>
///         let isPasswordValid: AnyPublisher<Bool, Never>
///         let isLoginEnabled: AnyPublisher<Bool, Never>
///         let loginResult: AnyPublisher<Result<User, Error>, Never>
///     }
///
///     func transform(_ input: Input) -> AnyPublisher<Output, Never> {
///         // Transform implementation
///     }
/// }
/// ```
public protocol ViewModelType {
    /// Type representing all possible input events and data for the view model.
    ///
    /// Typically implemented as a struct containing publishers for user actions and data inputs.
    /// Should be designed to capture all possible interactions that can affect the view model.
    associatedtype Input
    
    /// Type representing all possible output events and data from the view model.
    ///
    /// Typically implemented as a struct containing publishers that emit view state updates.
    /// Should contain all data needed to render the view's current state.
    associatedtype Output
    
    /// Transforms input events into output events using Combine framework.
    ///
    /// This method is the core of the view model's business logic, responsible for:
    /// - Processing input events from the view
    /// - Applying business logic and validation
    /// - Managing internal state
    /// - Emitting transformed output events
    ///
    /// - Parameter input: Object containing all possible input events
    /// - Returns: Publisher that emits transformed output events and never fails
    func transform(_ input: Input) -> AnyPublisher<Output, Never>
}