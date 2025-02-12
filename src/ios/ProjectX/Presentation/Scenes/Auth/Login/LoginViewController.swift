//
// LoginViewController.swift
// ProjectX
//
// View controller implementation for the login screen with MVVM architecture
// and comprehensive security features
// UIKit version: iOS 15.0+
// Combine version: iOS 15.0+
// LocalAuthentication version: iOS 15.0+
//

import UIKit
import Combine
import LocalAuthentication

@MainActor
final class LoginViewController: UIViewController, Storyboarded {
    
    // MARK: - Properties
    
    private let viewModel: LoginViewModel
    private var cancellables = Set<AnyCancellable>()
    private let biometricContext = LAContext()
    private var loginAttempts = 0
    
    // MARK: - UI Elements
    
    private lazy var emailTextField: UITextField = {
        let textField = UITextField()
        textField.placeholder = NSLocalizedString("Email", comment: "Email field placeholder")
        textField.keyboardType = .emailAddress
        textField.autocapitalizationType = .none
        textField.autocorrectionType = .no
        textField.returnKeyType = .next
        textField.accessibilityIdentifier = "login_email_field"
        return textField
    }()
    
    private lazy var passwordTextField: UITextField = {
        let textField = UITextField()
        textField.placeholder = NSLocalizedString("Password", comment: "Password field placeholder")
        textField.isSecureTextEntry = true
        textField.returnKeyType = .done
        textField.accessibilityIdentifier = "login_password_field"
        return textField
    }()
    
    private lazy var loginButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle(NSLocalizedString("Log In", comment: "Login button title"), for: .normal)
        button.accessibilityIdentifier = "login_button"
        button.isEnabled = false
        return button
    }()
    
    private lazy var biometricAuthButton: UIButton = {
        let button = UIButton(type: .system)
        button.isHidden = true
        button.accessibilityIdentifier = "biometric_auth_button"
        return button
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.hidesWhenStopped = true
        return indicator
    }()
    
    private lazy var errorContainer: UIStackView = {
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 8
        stackView.isHidden = true
        return stackView
    }()
    
    private lazy var errorLabel: UILabel = {
        let label = UILabel()
        label.textColor = .systemRed
        label.numberOfLines = 0
        label.font = .systemFont(ofSize: 14)
        label.accessibilityIdentifier = "login_error_label"
        return label
    }()
    
    // MARK: - Initialization
    
    init(viewModel: LoginViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
        configureBiometricAuth()
        
        // Configure keyboard handling
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }
    
    // MARK: - Private Methods
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        stackView.addArrangedSubview(emailTextField)
        stackView.addArrangedSubview(passwordTextField)
        stackView.addArrangedSubview(loginButton)
        stackView.addArrangedSubview(biometricAuthButton)
        stackView.addArrangedSubview(errorContainer)
        
        errorContainer.addArrangedSubview(errorLabel)
        
        view.addSubview(stackView)
        view.addSubview(loadingIndicator)
        
        NSLayoutConstraint.activate([
            stackView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            stackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.topAnchor.constraint(equalTo: stackView.bottomAnchor, constant: 16)
        ])
        
        // Configure secure text fields
        emailTextField.delegate = self
        passwordTextField.delegate = self
        
        // Configure accessibility
        emailTextField.accessibilityLabel = NSLocalizedString("Email Address", comment: "Email accessibility label")
        passwordTextField.accessibilityLabel = NSLocalizedString("Password", comment: "Password accessibility label")
        loginButton.accessibilityLabel = NSLocalizedString("Log In", comment: "Login button accessibility label")
    }
    
    private func bindViewModel() {
        let input = LoginViewModel.Input(
            emailInput: emailTextField.textPublisher,
            passwordInput: passwordTextField.textPublisher,
            loginTapped: loginButton.tapPublisher,
            biometricAuthTapped: biometricAuthButton.tapPublisher
        )
        
        let output = viewModel.transform(input)
        
        // Bind loading state
        output.isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                if isLoading {
                    self?.loadingIndicator.startAnimating()
                    self?.loginButton.isEnabled = false
                } else {
                    self?.loadingIndicator.stopAnimating()
                    self?.loginButton.isEnabled = true
                }
            }
            .store(in: &cancellables)
        
        // Bind validation states
        output.isEmailValid
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isValid in
                self?.emailTextField.layer.borderColor = isValid ? UIColor.systemGreen.cgColor : UIColor.systemRed.cgColor
            }
            .store(in: &cancellables)
        
        output.isPasswordValid
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isValid in
                self?.passwordTextField.layer.borderColor = isValid ? UIColor.systemGreen.cgColor : UIColor.systemRed.cgColor
            }
            .store(in: &cancellables)
        
        // Bind login button state
        output.isLoginEnabled
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isEnabled in
                self?.loginButton.isEnabled = isEnabled
                self?.loginButton.alpha = isEnabled ? 1.0 : 0.5
            }
            .store(in: &cancellables)
        
        // Bind error messages
        output.errorMessage
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                self?.handleError(error)
            }
            .store(in: &cancellables)
    }
    
    private func handleError(_ error: LoginViewModelError?) {
        guard let error = error else {
            errorContainer.isHidden = true
            return
        }
        
        errorContainer.isHidden = false
        errorLabel.text = error.localizedDescription
        
        // Increment login attempts for rate limiting
        if case .invalidCredentials = error {
            loginAttempts += 1
            if loginAttempts >= maxLoginAttempts {
                loginButton.isEnabled = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 300) { [weak self] in
                    self?.loginAttempts = 0
                    self?.loginButton.isEnabled = true
                }
            }
        }
        
        // Clear password field for security
        passwordTextField.text = ""
        
        // Update accessibility
        UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
    }
    
    private func configureBiometricAuth() {
        guard BiometricAuthManager.shared.isBiometricAuthAvailable() else {
            biometricAuthButton.isHidden = true
            return
        }
        
        let biometricType = biometricContext.biometryType
        let buttonImage: UIImage?
        let buttonTitle: String
        
        switch biometricType {
        case .faceID:
            buttonImage = UIImage(systemName: "faceid")
            buttonTitle = NSLocalizedString("Sign in with Face ID", comment: "Face ID button title")
        case .touchID:
            buttonImage = UIImage(systemName: "touchid")
            buttonTitle = NSLocalizedString("Sign in with Touch ID", comment: "Touch ID button title")
        default:
            biometricAuthButton.isHidden = true
            return
        }
        
        biometricAuthButton.setImage(buttonImage, for: .normal)
        biometricAuthButton.setTitle(buttonTitle, for: .normal)
        biometricAuthButton.isHidden = false
    }
    
    // MARK: - Keyboard Handling
    
    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
            return
        }
        
        let contentInsets = UIEdgeInsets(top: 0, left: 0, bottom: keyboardFrame.height, right: 0)
        adjustContentForKeyboard(contentInsets)
    }
    
    @objc private func keyboardWillHide(_ notification: Notification) {
        adjustContentForKeyboard(.zero)
    }
    
    private func adjustContentForKeyboard(_ insets: UIEdgeInsets) {
        UIView.animate(withDuration: 0.3) {
            self.view.layoutIfNeeded()
        }
    }
}

// MARK: - UITextFieldDelegate

extension LoginViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        switch textField {
        case emailTextField:
            passwordTextField.becomeFirstResponder()
        case passwordTextField:
            textField.resignFirstResponder()
            if loginButton.isEnabled {
                loginButton.sendActions(for: .touchUpInside)
            }
        default:
            break
        }
        return true
    }
}

// MARK: - Combine Extensions

private extension UITextField {
    var textPublisher: AnyPublisher<String, Never> {
        NotificationCenter.default
            .publisher(for: UITextField.textDidChangeNotification, object: self)
            .compactMap { ($0.object as? UITextField)?.text ?? "" }
            .eraseToAnyPublisher()
    }
}

private extension UIButton {
    var tapPublisher: AnyPublisher<Void, Never> {
        controlEventPublisher(for: .touchUpInside)
    }
    
    func controlEventPublisher(for events: UIControl.Event) -> AnyPublisher<Void, Never> {
        Publishers.ControlEvent(control: self, events: events)
            .eraseToAnyPublisher()
    }
}