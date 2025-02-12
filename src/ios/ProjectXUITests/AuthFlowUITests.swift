//
// AuthFlowUITests.swift
// ProjectXUITests
//
// UI test suite for authentication flows including login, signup, and biometric authentication
// XCTest version: iOS 15.0+
//

import XCTest

private let defaultTimeout: TimeInterval = 10.0
private let testEmail = "test@example.com"
private let testPassword = "Password123!"

class AuthFlowUITests: XCTestCase {
    private var app: XCUIApplication!
    
    override init() {
        super.init()
        app = XCUIApplication()
        // Configure test environment
        app.launchArguments = ["UI-TESTING"]
        app.launchEnvironment = ["AUTHENTICATION_MODE": "TEST"]
    }
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
        
        // Reset app state
        UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
        
        // Clear keychain items
        let secItemClasses = [kSecClassGenericPassword, kSecClassInternetPassword, kSecClassCertificate, kSecClassKey, kSecClassIdentity]
        secItemClasses.forEach { secItemClass in
            SecItemDelete([kSecClass: secItemClass] as CFDictionary)
        }
        
        // Reset biometric simulation state
        app.launchEnvironment["BIOMETRIC_ENROLLMENT_STATE"] = "NONE"
    }
    
    override func tearDownWithError() throws {
        // Graceful app termination
        app.terminate()
        
        // Clean up test artifacts
        let fileManager = FileManager.default
        if let cacheURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first {
            try? fileManager.removeItem(at: cacheURL)
        }
        
        // Reset network conditions
        app.launchEnvironment["NETWORK_CONDITION"] = "NORMAL"
    }
    
    func testSuccessfulLogin() throws {
        let emailTextField = app.textFields["emailTextField"]
        let passwordTextField = app.secureTextFields["passwordTextField"]
        let loginButton = app.buttons["loginButton"]
        
        // Test email input
        XCTAssertTrue(emailTextField.exists)
        emailTextField.tap()
        emailTextField.typeText(testEmail)
        
        // Test password input
        XCTAssertTrue(passwordTextField.exists)
        passwordTextField.tap()
        passwordTextField.typeText(testPassword)
        
        // Verify login button state
        XCTAssertTrue(loginButton.isEnabled)
        loginButton.tap()
        
        // Verify successful login
        let dashboardView = app.otherElements["dashboardView"]
        XCTAssertTrue(dashboardView.waitForExistence(timeout: defaultTimeout))
        
        // Verify session token
        let userProfile = app.staticTexts["userProfileName"]
        XCTAssertTrue(userProfile.exists)
    }
    
    func testLoginValidation() throws {
        let emailTextField = app.textFields["emailTextField"]
        let passwordTextField = app.secureTextFields["passwordTextField"]
        let loginButton = app.buttons["loginButton"]
        
        // Test empty fields
        loginButton.tap()
        let emailError = app.staticTexts["emailErrorLabel"]
        let passwordError = app.staticTexts["passwordErrorLabel"]
        XCTAssertTrue(emailError.exists)
        XCTAssertTrue(passwordError.exists)
        
        // Test invalid email format
        emailTextField.tap()
        emailTextField.typeText("invalid-email")
        loginButton.tap()
        XCTAssertTrue(app.staticTexts["Invalid email format"].exists)
        
        // Test password requirements
        passwordTextField.tap()
        passwordTextField.typeText("weak")
        loginButton.tap()
        XCTAssertTrue(app.staticTexts["Password must meet complexity requirements"].exists)
    }
    
    func testSuccessfulSignup() throws {
        let signupButton = app.buttons["createAccountButton"]
        XCTAssertTrue(signupButton.exists)
        signupButton.tap()
        
        // Fill signup form
        let nameField = app.textFields["fullNameTextField"]
        let emailField = app.textFields["signupEmailTextField"]
        let passwordField = app.secureTextFields["signupPasswordTextField"]
        let confirmPasswordField = app.secureTextFields["confirmPasswordTextField"]
        
        nameField.tap()
        nameField.typeText("Test User")
        
        emailField.tap()
        emailField.typeText(testEmail)
        
        passwordField.tap()
        passwordField.typeText(testPassword)
        
        confirmPasswordField.tap()
        confirmPasswordField.typeText(testPassword)
        
        // Submit signup
        app.buttons["signupSubmitButton"].tap()
        
        // Verify email verification screen
        XCTAssertTrue(app.staticTexts["Verify your email"].waitForExistence(timeout: defaultTimeout))
    }
    
    func testBiometricAuth() throws {
        // Enable biometric authentication
        app.launchEnvironment["BIOMETRIC_ENROLLMENT_STATE"] = "ENROLLED"
        
        let biometricButton = app.buttons["useBiometricsButton"]
        XCTAssertTrue(biometricButton.exists)
        biometricButton.tap()
        
        // Verify biometric prompt
        let biometricPrompt = app.alerts.element
        XCTAssertTrue(biometricPrompt.waitForExistence(timeout: defaultTimeout))
        
        // Simulate successful authentication
        app.launchEnvironment["BIOMETRIC_RESULT"] = "SUCCESS"
        biometricPrompt.buttons["authenticateButton"].tap()
        
        // Verify successful login
        let dashboardView = app.otherElements["dashboardView"]
        XCTAssertTrue(dashboardView.waitForExistence(timeout: defaultTimeout))
    }
    
    func testLogout() throws {
        // Perform login first
        try testSuccessfulLogin()
        
        // Navigate to profile
        let profileButton = app.buttons["profileButton"]
        XCTAssertTrue(profileButton.exists)
        profileButton.tap()
        
        // Perform logout
        let logoutButton = app.buttons["logoutButton"]
        XCTAssertTrue(logoutButton.exists)
        logoutButton.tap()
        
        // Verify confirmation dialog
        let confirmLogout = app.alerts["Confirm Logout"].buttons["Logout"]
        XCTAssertTrue(confirmLogout.exists)
        confirmLogout.tap()
        
        // Verify return to login screen
        let loginView = app.otherElements["loginView"]
        XCTAssertTrue(loginView.waitForExistence(timeout: defaultTimeout))
        
        // Verify session cleared
        XCTAssertFalse(app.otherElements["dashboardView"].exists)
    }
}