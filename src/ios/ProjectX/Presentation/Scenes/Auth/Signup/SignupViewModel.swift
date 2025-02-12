import Foundation
import Combine  // iOS 15.0+
import LocalAuthentication  // iOS 15.0+

/// Comprehensive validation errors for signup process
public enum SignupValidationError: LocalizedError {
    case invalidEmail
    case invalidPassword(PasswordValidationError)
    case invalidName
    case invalidPhone
    case passwordMismatch
    case biometricUnavailable
    case secureStorageFailed
    
    public var errorDescription: String? {
        switch self {
        case .invalidEmail:
            return NSLocalizedString("Please enter a valid email address", comment: "Invalid email error")
        case .invalidPassword(let error):
            switch error {
            case .tooShort:
                return NSLocalizedString("Password must be at least 8 characters", comment: "Password length error")
            case .missingUppercase:
                return NSLocalizedString("Password must contain at least one uppercase letter", comment: "Password uppercase error")
            case .missingSpecialChar:
                return NSLocalizedString("Password must contain at least one special character", comment: "Password special char error")
            case .missingNumber:
                return NSLocalizedString("Password must contain at least one number", comment: "Password number error")
            }
        case .invalidName:
            return NSLocalizedString("Please enter a valid name", comment: "Invalid name error")
        case .invalidPhone:
            return NSLocalizedString("Please enter a valid phone number", comment: "Invalid phone error")
        case .passwordMismatch:
            return NSLocalizedString("Passwords do not match", comment: "Password mismatch error")
        case .biometricUnavailable:
            return NSLocalizedString("Biometric authentication is not available", comment: "Biometric unavailable error")
        case .secureStorageFailed:
            return NSLocalizedString("Failed to securely store credentials", comment: "Secure storage error")
        }
    }
}

/// Password validation specific errors
public enum PasswordValidationError {
    case tooShort
    case missingUppercase
    case missingSpecialChar
    case missingNumber
}

/// Thread-safe view model for signup process with comprehensive security
@MainActor
public final class SignupViewModel: ViewModelType {
    
    // MARK: - Types
    
    public struct Input {
        let emailInput: AnyPublisher<String, Never>
        let passwordInput: AnyPublisher<String, Never>
        let confirmPasswordInput: AnyPublisher<String, Never>
        let nameInput: AnyPublisher<String, Never>
        let phoneInput: AnyPublisher<String, Never>
        let useBiometricInput: AnyPublisher<Bool, Never>
        let signupTrigger: AnyPublisher<Void, Never>
    }
    
    public struct Output {
        let isLoading: AnyPublisher<Bool, Never>
        let validationError: AnyPublisher<SignupValidationError?, Never>
        let signupResult: AnyPublisher<Result<Void, Error>, Never>
        let biometricAvailable: AnyPublisher<Bool, Never>
    }
    
    // MARK: - Properties
    
    private let authRepository: AuthRepository
    private var cancellables = Set<AnyCancellable>()
    private let signupTrigger = PassthroughSubject<Void, Never>()
    private let isLoadingSubject = CurrentValueSubject<Bool, Never>(false)
    private let validationErrorSubject = CurrentValueSubject<SignupValidationError?, Never>(nil)
    private let biometricAvailableSubject = CurrentValueSubject<Bool, Never>(false)
    
    // MARK: - Initialization
    
    public init(authRepository: AuthRepository) {
        self.authRepository = authRepository
        checkBiometricAvailability()
    }
    
    // MARK: - Public Methods
    
    public func transform(_ input: Input) -> Output {
        // Combine latest input values for validation
        let inputValues = Publishers.CombineLatest5(
            input.emailInput,
            input.passwordInput,
            input.confirmPasswordInput,
            input.nameInput,
            input.phoneInput
        )
        .combineLatest(input.useBiometricInput)
        
        // Handle signup trigger with validation
        input.signupTrigger
            .withLatest(from: inputValues)
            .sink { [weak self] (_, values) in
                let ((email, password, confirmPassword, name, phone), useBiometric) = values
                self?.handleSignup(
                    email: email,
                    password: password,
                    confirmPassword: confirmPassword,
                    name: name,
                    phone: phone,
                    useBiometric: useBiometric
                )
            }
            .store(in: &cancellables)
        
        // Configure output publishers
        let signupResult = signupTrigger
            .flatMap { [weak self] _ -> AnyPublisher<Result<Void, Error>, Never> in
                guard let self = self else {
                    return Just(.failure(SignupValidationError.secureStorageFailed))
                        .eraseToAnyPublisher()
                }
                return self.authRepository.signup()
                    .map { Result.success(()) }
                    .catch { error in Just(.failure(error)) }
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
        
        return Output(
            isLoading: isLoadingSubject.eraseToAnyPublisher(),
            validationError: validationErrorSubject.eraseToAnyPublisher(),
            signupResult: signupResult,
            biometricAvailable: biometricAvailableSubject.eraseToAnyPublisher()
        )
    }
    
    // MARK: - Private Methods
    
    private func validateInput(
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
        phone: String,
        useBiometric: Bool
    ) -> Result<Void, SignupValidationError> {
        // Validate email format
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        guard emailPredicate.evaluate(with: email) else {
            return .failure(.invalidEmail)
        }
        
        // Validate password requirements
        if password.count < 8 {
            return .failure(.invalidPassword(.tooShort))
        }
        if !password.contains(where: { $0.isUppercase }) {
            return .failure(.invalidPassword(.missingUppercase))
        }
        if !password.contains(where: { "!@#$%^&*(),.?\":{}|<>".contains($0) }) {
            return .failure(.invalidPassword(.missingSpecialChar))
        }
        if !password.contains(where: { $0.isNumber }) {
            return .failure(.invalidPassword(.missingNumber))
        }
        
        // Validate password confirmation
        guard password == confirmPassword else {
            return .failure(.passwordMismatch)
        }
        
        // Validate name
        guard name.count >= 2,
              name.components(separatedBy: " ").count >= 2,
              name.allSatisfy({ $0.isLetter || $0.isWhitespace }) else {
            return .failure(.invalidName)
        }
        
        // Validate phone number
        let phoneRegex = "^\\+?[1-9]\\d{1,14}$"
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", phoneRegex)
        guard phonePredicate.evaluate(with: phone) else {
            return .failure(.invalidPhone)
        }
        
        // Validate biometric availability if requested
        if useBiometric {
            let context = LAContext()
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                return .failure(.biometricUnavailable)
            }
        }
        
        return .success(())
    }
    
    private func handleSignup(
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
        phone: String,
        useBiometric: Bool
    ) {
        isLoadingSubject.send(true)
        validationErrorSubject.send(nil)
        
        // Validate input
        let validationResult = validateInput(
            email: email,
            password: password,
            confirmPassword: confirmPassword,
            name: name,
            phone: phone,
            useBiometric: useBiometric
        )
        
        switch validationResult {
        case .success:
            // Proceed with signup
            signupTrigger.send()
            
        case .failure(let error):
            validationErrorSubject.send(error)
            isLoadingSubject.send(false)
        }
    }
    
    private func checkBiometricAvailability() {
        let context = LAContext()
        var error: NSError?
        let canUseBiometric = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        biometricAvailableSubject.send(canUseBiometric)
    }
}