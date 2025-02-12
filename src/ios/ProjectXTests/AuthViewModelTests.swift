//
// AuthViewModelTests.swift
// ProjectXTests
//
// Comprehensive test suite for LoginViewModel validating authentication flows,
// security controls, and state management with thread-safe operations
// XCTest version: iOS 15.0+
// Combine version: iOS 15.0+
//

import XCTest
import Combine
@testable import ProjectX

final class AuthViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var viewModel: LoginViewModel!
    private var mockAuthRepository: MockAuthRepository!
    private var mockBiometricAuthManager: MockBiometricAuthManager!
    private var cancellables: Set<AnyCancellable>!
    private let testQueue = DispatchQueue(label: "com.projectx.test.auth")
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        mockAuthRepository = MockAuthRepository()
        mockBiometricAuthManager = MockBiometricAuthManager()
        viewModel = LoginViewModel(authRepository: mockAuthRepository)
        cancellables = Set<AnyCancellable>()
    }
    
    override func tearDown() {
        cancellables.forEach { $0.cancel() }
        cancellables = nil
        viewModel = nil
        mockAuthRepository = nil
        mockBiometricAuthManager = nil
        super.tearDown()
    }
    
    // MARK: - Email Validation Tests
    
    func testEmailValidation() {
        let emailSubject = PassthroughSubject<String, Never>()
        let input = createInput(emailInput: emailSubject.eraseToAnyPublisher())
        let output = viewModel.transform(input)
        
        var isValidResults: [Bool] = []
        output.isEmailValid
            .sink { isValid in
                isValidResults.append(isValid)
            }
            .store(in: &cancellables)
        
        // Test invalid email formats
        emailSubject.send("")
        emailSubject.send("invalid")
        emailSubject.send("test@")
        emailSubject.send("test@.com")
        
        // Test valid email format
        emailSubject.send("test@example.com")
        
        XCTAssertEqual(isValidResults, [false, false, false, false, true])
    }
    
    // MARK: - Password Validation Tests
    
    func testPasswordValidation() {
        let passwordSubject = PassthroughSubject<String, Never>()
        let input = createInput(passwordInput: passwordSubject.eraseToAnyPublisher())
        let output = viewModel.transform(input)
        
        var isValidResults: [Bool] = []
        output.isPasswordValid
            .sink { isValid in
                isValidResults.append(isValid)
            }
            .store(in: &cancellables)
        
        // Test invalid passwords
        passwordSubject.send("")
        passwordSubject.send("123")
        passwordSubject.send("short")
        
        // Test valid password
        passwordSubject.send("securepassword123")
        
        XCTAssertEqual(isValidResults, [false, false, false, true])
    }
    
    // MARK: - Login Flow Tests
    
    func testSuccessfulLogin() {
        let expectation = XCTestExpectation(description: "Login success")
        
        // Configure mock repository
        mockAuthRepository.loginResult = .success(User(id: UUID(), email: "test@example.com"))
        
        let emailSubject = PassthroughSubject<String, Never>()
        let passwordSubject = PassthroughSubject<String, Never>()
        let loginTapped = PassthroughSubject<Void, Never>()
        
        let input = createInput(
            emailInput: emailSubject.eraseToAnyPublisher(),
            passwordInput: passwordSubject.eraseToAnyPublisher(),
            loginTapped: loginTapped.eraseToAnyPublisher()
        )
        
        let output = viewModel.transform(input)
        
        // Monitor loading state
        var loadingStates: [Bool] = []
        output.isLoading
            .sink { isLoading in
                loadingStates.append(isLoading)
            }
            .store(in: &cancellables)
        
        // Monitor success
        output.loginSuccess
            .sink { _ in
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Trigger login flow
        emailSubject.send("test@example.com")
        passwordSubject.send("securepassword123")
        loginTapped.send(())
        
        wait(for: [expectation], timeout: 1.0)
        
        XCTAssertTrue(mockAuthRepository.loginCalled)
        XCTAssertEqual(loadingStates, [false, true, false])
    }
    
    func testLoginFailure() {
        let expectation = XCTestExpectation(description: "Login failure")
        
        // Configure mock repository
        mockAuthRepository.loginResult = .failure(AuthError.invalidCredentials)
        
        let emailSubject = PassthroughSubject<String, Never>()
        let passwordSubject = PassthroughSubject<String, Never>()
        let loginTapped = PassthroughSubject<Void, Never>()
        
        let input = createInput(
            emailInput: emailSubject.eraseToAnyPublisher(),
            passwordInput: passwordSubject.eraseToAnyPublisher(),
            loginTapped: loginTapped.eraseToAnyPublisher()
        )
        
        let output = viewModel.transform(input)
        
        var errorMessages: [String?] = []
        output.errorMessage
            .sink { message in
                errorMessages.append(message)
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Trigger login flow
        emailSubject.send("test@example.com")
        passwordSubject.send("wrongpassword")
        loginTapped.send(())
        
        wait(for: [expectation], timeout: 1.0)
        
        XCTAssertTrue(mockAuthRepository.loginCalled)
        XCTAssertEqual(errorMessages.last, LoginViewModelError.invalidPassword.localizedDescription)
    }
    
    // MARK: - Biometric Authentication Tests
    
    func testBiometricAuthSuccess() {
        let expectation = XCTestExpectation(description: "Biometric auth success")
        
        // Configure mocks
        mockBiometricAuthManager.isAvailable = true
        mockBiometricAuthManager.authenticationResult = .success(true)
        mockAuthRepository.loginResult = .success(User(id: UUID(), email: "test@example.com"))
        
        let biometricTapped = PassthroughSubject<Void, Never>()
        let input = createInput(biometricAuthTapped: biometricTapped.eraseToAnyPublisher())
        let output = viewModel.transform(input)
        
        output.loginSuccess
            .sink { _ in
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        biometricTapped.send(())
        
        wait(for: [expectation], timeout: 1.0)
        
        XCTAssertTrue(mockBiometricAuthManager.authenticationCalled)
    }
    
    func testBiometricAuthFailure() {
        let expectation = XCTestExpectation(description: "Biometric auth failure")
        
        // Configure mocks
        mockBiometricAuthManager.isAvailable = true
        mockBiometricAuthManager.authenticationResult = .failure(.failed(nil))
        
        let biometricTapped = PassthroughSubject<Void, Never>()
        let input = createInput(biometricAuthTapped: biometricTapped.eraseToAnyPublisher())
        let output = viewModel.transform(input)
        
        output.errorMessage
            .sink { message in
                XCTAssertEqual(message, LoginViewModelError.biometricAuthFailed.localizedDescription)
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        biometricTapped.send(())
        
        wait(for: [expectation], timeout: 1.0)
    }
    
    // MARK: - Thread Safety Tests
    
    func testConcurrentLoginAttempts() {
        let expectation = XCTestExpectation(description: "Concurrent logins")
        expectation.expectedFulfillmentCount = 3
        
        mockAuthRepository.loginResult = .success(User(id: UUID(), email: "test@example.com"))
        
        let loginTapped = PassthroughSubject<Void, Never>()
        let input = createInput(
            emailInput: Just("test@example.com").eraseToAnyPublisher(),
            passwordInput: Just("password123").eraseToAnyPublisher(),
            loginTapped: loginTapped.eraseToAnyPublisher()
        )
        
        let output = viewModel.transform(input)
        
        output.loginSuccess
            .sink { _ in
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Trigger multiple concurrent login attempts
        DispatchQueue.concurrentPerform(iterations: 3) { _ in
            loginTapped.send(())
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    // MARK: - Helper Methods
    
    private func createInput(
        emailInput: AnyPublisher<String, Never> = Empty().eraseToAnyPublisher(),
        passwordInput: AnyPublisher<String, Never> = Empty().eraseToAnyPublisher(),
        loginTapped: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher(),
        biometricAuthTapped: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher()
    ) -> LoginViewModel.Input {
        return LoginViewModel.Input(
            emailInput: emailInput,
            passwordInput: passwordInput,
            loginTapped: loginTapped,
            biometricAuthTapped: biometricAuthTapped
        )
    }
}

// MARK: - Mock Objects

private class MockAuthRepository: AuthRepository {
    var loginCalled = false
    var validateTokenCalled = false
    var loginResult: Result<User, AuthError> = .failure(.unknown)
    
    override func login(email: String, password: String) -> AnyPublisher<User, AuthError> {
        loginCalled = true
        return Just(loginResult)
            .setFailureType(to: AuthError.self)
            .flatMap { $0.publisher }
            .eraseToAnyPublisher()
    }
}

private class MockBiometricAuthManager: BiometricAuthManager {
    var authenticationCalled = false
    var isAvailable = false
    var authenticationResult: Result<Bool, BiometricAuthError> = .failure(.unknown(nil))
    
    override func isBiometricAuthAvailable() -> Bool {
        return isAvailable
    }
    
    override func authenticateWithBiometrics(
        reason: String,
        fallbackEnabled: Bool
    ) -> Result<Bool, BiometricAuthError> {
        authenticationCalled = true
        return authenticationResult
    }
}