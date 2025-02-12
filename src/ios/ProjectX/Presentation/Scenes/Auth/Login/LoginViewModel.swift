//
// LoginViewModel.swift
// ProjectX
//
// Thread-safe view model implementing secure login functionality with comprehensive error handling
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
//

import Foundation
import Combine

/// Comprehensive error types for login operations
public enum LoginViewModelError: LocalizedError {
    case invalidEmail
    case invalidPassword
    case biometricAuthFailed
    case networkError
    case tooManyAttempts
    case serverError
    
    public var errorDescription: String? {
        switch self {
        case .invalidEmail:
            return NSLocalizedString("Please enter a valid email address", comment: "Invalid email error")
        case .invalidPassword:
            return NSLocalizedString("Password must be at least 8 characters", comment: "Invalid password error")
        case .biometricAuthFailed:
            return NSLocalizedString("Biometric authentication failed", comment: "Biometric auth error")
        case .networkError:
            return NSLocalizedString("Network connection error. Please try again", comment: "Network error")
        case .tooManyAttempts:
            return NSLocalizedString("Too many login attempts. Please try again later", comment: "Rate limit error")
        case .serverError:
            return NSLocalizedString("Server error. Please try again later", comment: "Server error")
        }
    }
}

/// Thread-safe view model implementing MVVM pattern for login functionality
public final class LoginViewModel: ViewModelType {
    
    // MARK: - Types
    
    public struct Input {
        let emailInput: AnyPublisher<String, Never>
        let passwordInput: AnyPublisher<String, Never>
        let loginTapped: AnyPublisher<Void, Never>
        let biometricAuthTapped: AnyPublisher<Void, Never>
    }
    
    public struct Output {
        let isLoading: AnyPublisher<Bool, Never>
        let isEmailValid: AnyPublisher<Bool, Never>
        let isPasswordValid: AnyPublisher<Bool, Never>
        let isLoginEnabled: AnyPublisher<Bool, Never>
        let errorMessage: AnyPublisher<String?, Never>
        let loginSuccess: AnyPublisher<Void, Never>
    }
    
    // MARK: - Properties
    
    private let authRepository: AuthRepository
    private let biometricAuthManager: BiometricAuthManager
    private let isLoadingSubject = CurrentValueSubject<Bool, Never>(false)
    private let errorMessageSubject = PassthroughSubject<String?, Never>()
    private let loginSuccessSubject = PassthroughSubject<Void, Never>()
    private var cancellables = Set<AnyCancellable>()
    
    private var loginAttempts = 0
    private let maxLoginAttempts = 5
    private var loginThrottleTimer: Timer?
    
    // MARK: - Initialization
    
    public init(authRepository: AuthRepository) {
        self.authRepository = authRepository
        self.biometricAuthManager = BiometricAuthManager.shared
    }
    
    // MARK: - ViewModelType
    
    public func transform(_ input: Input) -> Output {
        // Email validation
        let isEmailValid = input.emailInput
            .map { [weak self] email in
                self?.validateEmail(email) ?? false
            }
            .eraseToAnyPublisher()
        
        // Password validation
        let isPasswordValid = input.passwordInput
            .map { [weak self] password in
                self?.validatePassword(password) ?? false
            }
            .eraseToAnyPublisher()
        
        // Login button state
        let isLoginEnabled = Publishers.CombineLatest(isEmailValid, isPasswordValid)
            .map { $0 && $1 }
            .eraseToAnyPublisher()
        
        // Handle login button tap
        input.loginTapped
            .filter { [weak self] _ in
                guard let self = self else { return false }
                return self.loginAttempts < self.maxLoginAttempts
            }
            .withLatestFrom(
                Publishers.CombineLatest(input.emailInput, input.passwordInput)
            )
            .sink { [weak self] email, password in
                self?.handleLogin(email: email, password: password)
            }
            .store(in: &cancellables)
        
        // Handle biometric authentication
        input.biometricAuthTapped
            .filter { [weak self] _ in
                self?.biometricAuthManager.isBiometricAuthAvailable() ?? false
            }
            .sink { [weak self] _ in
                self?.handleBiometricAuth()
            }
            .store(in: &cancellables)
        
        return Output(
            isLoading: isLoadingSubject.eraseToAnyPublisher(),
            isEmailValid: isEmailValid,
            isPasswordValid: isPasswordValid,
            isLoginEnabled: isLoginEnabled,
            errorMessage: errorMessageSubject.eraseToAnyPublisher(),
            loginSuccess: loginSuccessSubject.eraseToAnyPublisher()
        )
    }
    
    // MARK: - Private Methods
    
    private func validateEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }
    
    private func validatePassword(_ password: String) -> Bool {
        return password.count >= 8
    }
    
    private func handleLogin(email: String, password: String) {
        guard !isLoadingSubject.value else { return }
        
        isLoadingSubject.send(true)
        loginAttempts += 1
        
        authRepository.login(email: email, password: password)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    guard let self = self else { return }
                    self.isLoadingSubject.send(false)
                    
                    if case .failure(let error) = completion {
                        self.handleLoginError(error)
                    }
                },
                receiveValue: { [weak self] _ in
                    self?.handleLoginSuccess()
                }
            )
            .store(in: &cancellables)
    }
    
    private func handleBiometricAuth() {
        guard !isLoadingSubject.value else { return }
        
        isLoadingSubject.send(true)
        
        let result = biometricAuthManager.authenticateWithBiometrics(
            reason: "Log in to your account",
            fallbackEnabled: true
        )
        
        switch result {
        case .success:
            authRepository.authenticateWithBiometrics()
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        self?.isLoadingSubject.send(false)
                        if case .failure(let error) = completion {
                            self?.errorMessageSubject.send(error.localizedDescription)
                        }
                    },
                    receiveValue: { [weak self] _ in
                        self?.handleLoginSuccess()
                    }
                )
                .store(in: &cancellables)
            
        case .failure(let error):
            isLoadingSubject.send(false)
            errorMessageSubject.send(error.localizedDescription)
        }
    }
    
    private func handleLoginSuccess() {
        loginAttempts = 0
        loginThrottleTimer?.invalidate()
        loginSuccessSubject.send(())
    }
    
    private func handleLoginError(_ error: Error) {
        if loginAttempts >= maxLoginAttempts {
            startLoginThrottle()
            errorMessageSubject.send(LoginViewModelError.tooManyAttempts.localizedDescription)
            return
        }
        
        if let authError = error as? AuthError {
            switch authError {
            case .invalidCredentials:
                errorMessageSubject.send(LoginViewModelError.invalidPassword.localizedDescription)
            case .networkError:
                errorMessageSubject.send(LoginViewModelError.networkError.localizedDescription)
            case .biometricsFailed:
                errorMessageSubject.send(LoginViewModelError.biometricAuthFailed.localizedDescription)
            default:
                errorMessageSubject.send(LoginViewModelError.serverError.localizedDescription)
            }
        } else {
            errorMessageSubject.send(LoginViewModelError.serverError.localizedDescription)
        }
    }
    
    private func startLoginThrottle() {
        loginThrottleTimer?.invalidate()
        loginThrottleTimer = Timer.scheduledTimer(
            withTimeInterval: 300, // 5 minutes
            repeats: false
        ) { [weak self] _ in
            self?.resetLoginThrottle()
        }
    }
    
    private func resetLoginThrottle() {
        loginAttempts = 0
        loginThrottleTimer?.invalidate()
        loginThrottleTimer = nil
    }
}