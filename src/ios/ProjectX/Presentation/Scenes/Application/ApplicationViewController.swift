//
// ApplicationViewController.swift
// ProjectX
//
// Thread-safe view controller managing rental application submission with comprehensive validation,
// error handling, and accessibility support
// Version: iOS 15.0+
//

import UIKit
import Combine

@MainActor
final class ApplicationViewController: UIViewController, Storyboarded {
    
    // MARK: - Properties
    
    private let viewModel: ApplicationViewModel
    private var cancellables = Set<AnyCancellable>()
    private let documentUploadLock = NSLock()
    
    // MARK: - UI Components
    
    private lazy var formStackView: UIStackView = {
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.distribution = .fill
        stackView.alignment = .fill
        stackView.translatesAutoresizingMaskIntoConstraints = false
        return stackView
    }()
    
    private lazy var nameTextField: UITextField = {
        let textField = UITextField()
        textField.placeholder = "Full Name"
        textField.borderStyle = .roundedRect
        textField.accessibilityIdentifier = "application.name.textfield"
        textField.accessibilityLabel = "Full Name"
        return textField
    }()
    
    private lazy var emailTextField: UITextField = {
        let textField = UITextField()
        textField.placeholder = "Email Address"
        textField.borderStyle = .roundedRect
        textField.keyboardType = .emailAddress
        textField.autocapitalizationType = .none
        textField.accessibilityIdentifier = "application.email.textfield"
        textField.accessibilityLabel = "Email Address"
        return textField
    }()
    
    private lazy var phoneTextField: UITextField = {
        let textField = UITextField()
        textField.placeholder = "Phone Number"
        textField.borderStyle = .roundedRect
        textField.keyboardType = .phonePad
        textField.accessibilityIdentifier = "application.phone.textfield"
        textField.accessibilityLabel = "Phone Number"
        return textField
    }()
    
    private lazy var uploadDocumentButton: UIButton = {
        var configuration = UIButton.Configuration.filled()
        configuration.title = "Upload Documents"
        configuration.image = UIImage(systemName: "doc.badge.plus")
        configuration.imagePlacement = .leading
        configuration.imagePadding = 8
        
        let button = UIButton(configuration: configuration)
        button.accessibilityIdentifier = "application.upload.button"
        button.accessibilityLabel = "Upload Documents"
        return button
    }()
    
    private lazy var submitButton: UIButton = {
        var configuration = UIButton.Configuration.filled()
        configuration.title = "Submit Application"
        configuration.baseBackgroundColor = .systemBlue
        
        let button = UIButton(configuration: configuration)
        button.accessibilityIdentifier = "application.submit.button"
        button.accessibilityLabel = "Submit Application"
        button.isEnabled = false
        return button
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .large)
        indicator.hidesWhenStopped = true
        indicator.accessibilityIdentifier = "application.loading.indicator"
        return indicator
    }()
    
    private lazy var uploadProgressView: UIProgressView = {
        let progress = UIProgressView(progressViewStyle: .default)
        progress.isHidden = true
        progress.accessibilityIdentifier = "application.upload.progress"
        return progress
    }()
    
    private lazy var errorLabel: UILabel = {
        let label = UILabel()
        label.textColor = .systemRed
        label.numberOfLines = 0
        label.isHidden = true
        label.accessibilityIdentifier = "application.error.label"
        return label
    }()
    
    private var isSubmitting: Bool = false
    
    // MARK: - Initialization
    
    init(viewModel: ApplicationViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle Methods
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
        setupAccessibility()
    }
    
    // MARK: - Setup Methods
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        title = "Rental Application"
        
        view.addSubview(formStackView)
        
        formStackView.addArrangedSubview(nameTextField)
        formStackView.addArrangedSubview(emailTextField)
        formStackView.addArrangedSubview(phoneTextField)
        formStackView.addArrangedSubview(uploadDocumentButton)
        formStackView.addArrangedSubview(uploadProgressView)
        formStackView.addArrangedSubview(errorLabel)
        formStackView.addArrangedSubview(submitButton)
        
        view.addSubview(loadingIndicator)
        
        NSLayoutConstraint.activate([
            formStackView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            formStackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            formStackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        
        uploadDocumentButton.addTarget(self, action: #selector(handleDocumentUpload), for: .touchUpInside)
        submitButton.addTarget(self, action: #selector(handleSubmit), for: .touchUpInside)
    }
    
    private func bindViewModel() {
        let input = ApplicationViewModel.Input(
            submitApplication: submitButton.publisher(for: .touchUpInside)
                .map { [weak self] _ in
                    Application(
                        name: self?.nameTextField.text ?? "",
                        email: self?.emailTextField.text ?? "",
                        phone: self?.phoneTextField.text ?? ""
                    )
                }
                .eraseToAnyPublisher(),
            
            uploadDocument: uploadDocumentButton.publisher(for: .touchUpInside)
                .map { _ in () }
                .eraseToAnyPublisher()
        )
        
        let output = viewModel.transform(input)
        
        output.isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                self?.updateLoadingState(isLoading)
            }
            .store(in: &cancellables)
        
        output.progress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] progress in
                self?.updateProgress(progress)
            }
            .store(in: &cancellables)
        
        output.error
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                self?.showError(error)
            }
            .store(in: &cancellables)
        
        // Form validation
        Publishers.CombineLatest3(
            nameTextField.textPublisher,
            emailTextField.textPublisher,
            phoneTextField.textPublisher
        )
        .map { name, email, phone in
            !name.isEmpty && !email.isEmpty && !phone.isEmpty
        }
        .assign(to: \.isEnabled, on: submitButton)
        .store(in: &cancellables)
    }
    
    private func setupAccessibility() {
        view.accessibilityIdentifier = "application.view"
        
        nameTextField.accessibilityHint = "Enter your full legal name"
        emailTextField.accessibilityHint = "Enter your email address for communication"
        phoneTextField.accessibilityHint = "Enter your phone number for contact"
        uploadDocumentButton.accessibilityHint = "Upload required documents like ID and proof of income"
        submitButton.accessibilityHint = "Submit your rental application"
        
        // Voice over grouping
        let formGroup = UIAccessibilityElement(accessibilityContainer: formStackView)
        formGroup.accessibilityLabel = "Application Form"
        formGroup.accessibilityFrameInContainerSpace = formStackView.bounds
        formGroup.accessibilityTraits = .group
    }
    
    // MARK: - Action Handlers
    
    @objc private func handleDocumentUpload() {
        documentUploadLock.lock()
        defer { documentUploadLock.unlock() }
        
        let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf, .image])
        documentPicker.delegate = self
        documentPicker.allowsMultipleSelection = true
        present(documentPicker, animated: true)
    }
    
    @objc private func handleSubmit() {
        guard !isSubmitting else { return }
        isSubmitting = true
        
        view.endEditing(true)
        
        // Create application object
        let application = Application(
            name: nameTextField.text ?? "",
            email: emailTextField.text ?? "",
            phone: phoneTextField.text ?? ""
        )
        
        viewModel.transform(.submitApplication(application))
            .sink { [weak self] completion in
                self?.isSubmitting = false
                if case .failure(let error) = completion {
                    self?.showError(error)
                }
            } receiveValue: { [weak self] _ in
                self?.handleSubmissionSuccess()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Helper Methods
    
    private func updateLoadingState(_ isLoading: Bool) {
        if isLoading {
            loadingIndicator.startAnimating()
            submitButton.isEnabled = false
        } else {
            loadingIndicator.stopAnimating()
            submitButton.isEnabled = true
        }
    }
    
    private func updateProgress(_ progress: Double) {
        uploadProgressView.isHidden = false
        uploadProgressView.progress = Float(progress)
        
        if progress >= 1.0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.uploadProgressView.isHidden = true
                self?.uploadProgressView.progress = 0.0
            }
        }
    }
    
    private func showError(_ error: Error) {
        errorLabel.text = error.localizedDescription
        errorLabel.isHidden = false
        
        UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
    }
    
    private func handleSubmissionSuccess() {
        let alert = UIAlertController(
            title: "Success",
            message: "Your application has been submitted successfully",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.navigationController?.popViewController(animated: true)
        })
        
        present(alert, animated: true)
    }
}

// MARK: - UIDocumentPickerDelegate

extension ApplicationViewController: UIDocumentPickerDelegate {
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        documentUploadLock.lock()
        defer { documentUploadLock.unlock() }
        
        guard let url = urls.first else { return }
        
        do {
            let data = try Data(contentsOf: url)
            viewModel.transform(.uploadDocument(data, url.pathExtension, "document"))
        } catch {
            showError(error)
        }
    }
}

// MARK: - UITextField Extensions

private extension UITextField {
    var textPublisher: AnyPublisher<String, Never> {
        NotificationCenter.default.publisher(
            for: UITextField.textDidChangeNotification,
            object: self
        )
        .compactMap { ($0.object as? UITextField)?.text }
        .eraseToAnyPublisher()
    }
}