import UIKit
import Combine  // iOS 15.0+

/// Constants for signup view controller
private enum SignupViewControllerConstants {
    static let animationDuration: TimeInterval = 0.3
    static let minimumPasswordLength: Int = 8
    static let maximumPasswordLength: Int = 32
    static let loadingAlpha: CGFloat = 0.7
    static let cornerRadius: CGFloat = 8.0
    static let textFieldHeight: CGFloat = 48.0
}

/// View controller managing the signup screen UI and user interactions
@objc public final class SignupViewController: UIViewController {
    
    // MARK: - Properties
    
    private let viewModel: SignupViewModel
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - UI Elements
    
    @IBOutlet private weak var emailTextField: UITextField!
    @IBOutlet private weak var passwordTextField: UITextField!
    @IBOutlet private weak var confirmPasswordTextField: UITextField!
    @IBOutlet private weak var nameTextField: UITextField!
    @IBOutlet private weak var phoneTextField: UITextField!
    @IBOutlet private weak var signupButton: UIButton!
    @IBOutlet private weak var loadingIndicator: UIActivityIndicatorView!
    @IBOutlet private weak var formStackView: UIStackView!
    
    private let biometricSwitch: UISwitch = {
        let toggle = UISwitch()
        toggle.isOn = false
        toggle.accessibilityLabel = NSLocalizedString("Enable biometric login", comment: "")
        return toggle
    }()
    
    // MARK: - Initialization
    
    public init(viewModel: SignupViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle Methods
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        configureUI()
        setupBindings()
        setupAccessibility()
        setupKeyboardHandling()
    }
    
    // MARK: - UI Configuration
    
    private func configureUI() {
        title = NSLocalizedString("Sign Up", comment: "")
        view.backgroundColor = .systemBackground
        
        // Configure text fields
        [emailTextField, passwordTextField, confirmPasswordTextField, 
         nameTextField, phoneTextField].forEach { textField in
            textField?.delegate = self
            textField?.layer.cornerRadius = SignupViewControllerConstants.cornerRadius
            textField?.layer.borderWidth = 1.0
            textField?.layer.borderColor = UIColor.separator.cgColor
            textField?.heightAnchor.constraint(
                equalToConstant: SignupViewControllerConstants.textFieldHeight
            ).isActive = true
        }
        
        // Configure secure text fields
        passwordTextField.isSecureTextEntry = true
        confirmPasswordTextField.isSecureTextEntry = true
        
        // Configure signup button
        signupButton.layer.cornerRadius = SignupViewControllerConstants.cornerRadius
        signupButton.backgroundColor = .systemBlue
        signupButton.setTitleColor(.white, for: .normal)
        
        // Configure loading indicator
        loadingIndicator.hidesWhenStopped = true
        
        // Configure biometric switch
        let biometricContainer = UIStackView(arrangedSubviews: [
            UILabel().then {
                $0.text = NSLocalizedString("Enable Biometric Login", comment: "")
                $0.font = .preferredFont(forTextStyle: .body)
            },
            biometricSwitch
        ])
        biometricContainer.axis = .horizontal
        biometricContainer.spacing = 8
        formStackView.addArrangedSubview(biometricContainer)
        
        // Check biometric availability
        if !BiometricAuthManager.shared.isBiometricAuthAvailable() {
            biometricContainer.isHidden = true
        }
    }
    
    private func setupBindings() {
        // Create input streams
        let emailInput = NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: emailTextField
        ).compactMap { ($0.object as? UITextField)?.text }
        
        let passwordInput = NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: passwordTextField
        ).compactMap { ($0.object as? UITextField)?.text }
        
        let confirmPasswordInput = NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: confirmPasswordTextField
        ).compactMap { ($0.object as? UITextField)?.text }
        
        let nameInput = NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: nameTextField
        ).compactMap { ($0.object as? UITextField)?.text }
        
        let phoneInput = NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: phoneTextField
        ).compactMap { ($0.object as? UITextField)?.text }
        
        let biometricInput = biometricSwitch.publisher(for: \.isOn)
        
        let signupTrigger = signupButton.publisher(for: .touchUpInside)
            .map { _ in () }
        
        // Transform inputs through view model
        let input = SignupViewModel.Input(
            emailInput: emailInput.eraseToAnyPublisher(),
            passwordInput: passwordInput.eraseToAnyPublisher(),
            confirmPasswordInput: confirmPasswordInput.eraseToAnyPublisher(),
            nameInput: nameInput.eraseToAnyPublisher(),
            phoneInput: phoneInput.eraseToAnyPublisher(),
            useBiometricInput: biometricInput.eraseToAnyPublisher(),
            signupTrigger: signupTrigger.eraseToAnyPublisher()
        )
        
        let output = viewModel.transform(input)
        
        // Bind outputs
        output.isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                self?.updateLoadingState(isLoading)
            }
            .store(in: &cancellables)
        
        output.validationError
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                if let error = error {
                    self?.showError(message: error.localizedDescription)
                }
            }
            .store(in: &cancellables)
        
        output.signupResult
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                switch result {
                case .success:
                    self?.handleSignupSuccess()
                case .failure(let error):
                    self?.showError(message: error.localizedDescription)
                }
            }
            .store(in: &cancellables)
        
        output.biometricAvailable
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isAvailable in
                self?.biometricSwitch.isEnabled = isAvailable
            }
            .store(in: &cancellables)
    }
    
    private func setupAccessibility() {
        emailTextField.accessibilityLabel = NSLocalizedString("Email address", comment: "")
        passwordTextField.accessibilityLabel = NSLocalizedString("Password", comment: "")
        confirmPasswordTextField.accessibilityLabel = NSLocalizedString("Confirm password", comment: "")
        nameTextField.accessibilityLabel = NSLocalizedString("Full name", comment: "")
        phoneTextField.accessibilityLabel = NSLocalizedString("Phone number", comment: "")
        signupButton.accessibilityLabel = NSLocalizedString("Sign up", comment: "")
    }
    
    // MARK: - Helper Methods
    
    private func updateLoadingState(_ isLoading: Bool) {
        view.isUserInteractionEnabled = !isLoading
        signupButton.isEnabled = !isLoading
        
        if isLoading {
            loadingIndicator.startAnimating()
            UIView.animate(withDuration: SignupViewControllerConstants.animationDuration) {
                self.view.alpha = SignupViewControllerConstants.loadingAlpha
            }
        } else {
            loadingIndicator.stopAnimating()
            UIView.animate(withDuration: SignupViewControllerConstants.animationDuration) {
                self.view.alpha = 1.0
            }
        }
    }
    
    private func handleSignupSuccess() {
        // Clear sensitive data
        passwordTextField.text = nil
        confirmPasswordTextField.text = nil
        
        let alert = UIAlertController(
            title: NSLocalizedString("Success", comment: ""),
            message: NSLocalizedString("Your account has been created successfully.", comment: ""),
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(
            title: NSLocalizedString("Continue", comment: ""),
            style: .default,
            handler: { [weak self] _ in
                self?.navigateToDashboard()
            }
        ))
        
        present(alert, animated: true)
    }
    
    private func showError(message: String) {
        let alert = UIAlertController(
            title: NSLocalizedString("Error", comment: ""),
            message: message,
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(
            title: NSLocalizedString("OK", comment: ""),
            style: .default
        ))
        
        present(alert, animated: true)
    }
    
    private func navigateToDashboard() {
        // Navigation logic to be implemented by the coordinator
    }
}

// MARK: - UITextFieldDelegate

extension SignupViewController: UITextFieldDelegate {
    public func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        switch textField {
        case emailTextField:
            passwordTextField.becomeFirstResponder()
        case passwordTextField:
            confirmPasswordTextField.becomeFirstResponder()
        case confirmPasswordTextField:
            nameTextField.becomeFirstResponder()
        case nameTextField:
            phoneTextField.becomeFirstResponder()
        case phoneTextField:
            textField.resignFirstResponder()
            signupButton.sendActions(for: .touchUpInside)
        default:
            textField.resignFirstResponder()
        }
        return true
    }
}

// MARK: - Keyboard Handling

private extension SignupViewController {
    func setupKeyboardHandling() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .merge(with: NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handleKeyboardNotification(notification)
            }
            .store(in: &cancellables)
    }
    
    func handleKeyboardNotification(_ notification: Notification) {
        guard let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
            return
        }
        
        let keyboardHeight = notification.name == UIResponder.keyboardWillShowNotification ? keyboardFrame.height : 0
        
        UIView.animate(withDuration: SignupViewControllerConstants.animationDuration) {
            self.view.frame.origin.y = -keyboardHeight
        }
    }
}