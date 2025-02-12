//
// PaymentViewController.swift
// ProjectX
//
// View controller that handles secure payment processing with comprehensive monitoring
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// Stripe version: 23.0.0
// DatadogCore version: 1.0.0
// SecurityKit version: 2.0.0
//

import UIKit
import Combine
import DatadogCore
import StripePaymentSheet
import SecurityKit

private enum PaymentSection: Int, CaseIterable {
    case amount
    case details
    case history
    case security
}

private enum SecurityError: LocalizedError {
    case jailbreakDetected
    case invalidEnvironment
    case securityValidationFailed
    
    var errorDescription: String? {
        switch self {
        case .jailbreakDetected:
            return "Device security compromised"
        case .invalidEnvironment:
            return "Invalid security environment"
        case .securityValidationFailed:
            return "Security validation failed"
        }
    }
}

final class PaymentViewController: UIViewController {
    
    // MARK: - Properties
    
    private let viewModel: PaymentViewModel
    private let securityManager: SecurityKit
    private let monitor: DatadogCore.Monitor
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - UI Elements
    
    @IBOutlet private weak var amountTextField: UITextField!
    @IBOutlet private weak var payButton: LoadingButton!
    @IBOutlet private weak var paymentHistoryTableView: UITableView!
    @IBOutlet private weak var paymentDetailsStack: UIStackView!
    @IBOutlet private weak var totalAmountLabel: UILabel!
    @IBOutlet private weak var feeLabel: UILabel!
    @IBOutlet private weak var securityStatusLabel: UILabel!
    
    // MARK: - Initialization
    
    init(viewModel: PaymentViewModel, securityManager: SecurityKit, monitor: DatadogCore.Monitor) {
        self.viewModel = viewModel
        self.securityManager = securityManager
        self.monitor = monitor
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Perform security validation
        guard validateSecurityEnvironment() else {
            handleSecurityError(.invalidEnvironment)
            return
        }
        
        setupSecureUI()
        bindSecureViewModel()
        configureMonitoring()
    }
    
    // MARK: - Private Methods
    
    private func validateSecurityEnvironment() -> Bool {
        do {
            // Check for jailbreak
            try securityManager.validateDeviceIntegrity()
            
            // Validate runtime environment
            try securityManager.validateRuntimeEnvironment()
            
            // Verify SSL certificate pinning
            try securityManager.validateSSLCertificates()
            
            // Check keychain security
            try securityManager.validateKeychainAccess()
            
            return true
        } catch {
            monitor.error("Security validation failed", error: error)
            return false
        }
    }
    
    private func setupSecureUI() {
        // Configure secure text input
        amountTextField.isSecureTextEntry = true
        amountTextField.keyboardType = .numberPad
        amountTextField.delegate = self
        
        // Configure payment button
        payButton.cornerRadius = UI.CORNER_RADIUS
        payButton.spinnerColor = .white
        payButton.setTitle("Process Payment", for: .normal)
        
        // Configure table view
        paymentHistoryTableView.dataSource = self
        paymentHistoryTableView.delegate = self
        paymentHistoryTableView.register(UITableViewCell.self, forCellReuseIdentifier: "PaymentCell")
        
        // Configure security status
        securityStatusLabel.textColor = .systemGreen
        securityStatusLabel.text = "Environment Secure"
        
        setupAccessibility()
    }
    
    private func bindSecureViewModel() {
        // Bind view model state
        viewModel.state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.handleViewState(state)
            }
            .store(in: &cancellables)
        
        // Monitor payment history
        viewModel.getPaymentHistory(page: 1, limit: 20)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.handleError(error)
                    }
                },
                receiveValue: { [weak self] payments in
                    self?.updatePaymentHistory(payments)
                }
            )
            .store(in: &cancellables)
    }
    
    private func configureMonitoring() {
        monitor.configure(
            sampleRate: 1.0,
            serviceName: "ios-payment-view"
        )
        
        // Track view lifecycle
        monitor.trackView(name: "PaymentView", state: "active")
    }
    
    private func handleViewState(_ state: PaymentViewState) {
        switch state {
        case .idle:
            payButton.stopLoading()
            payButton.isEnabled = true
            
        case .loading:
            payButton.startLoading()
            payButton.isEnabled = false
            
        case .validating:
            securityStatusLabel.text = "Validating Security..."
            
        case .processing(let progress):
            updateProcessingProgress(progress)
            
        case .success(let payment):
            handlePaymentSuccess(payment)
            
        case .error(let error):
            handleError(error)
            
        case .securityError(let error):
            handleSecurityError(error)
        }
    }
    
    private func updateProcessingProgress(_ progress: Float) {
        // Update UI with processing progress
        let progressText = String(format: "Processing (%.0f%%)", progress * 100)
        payButton.setTitle(progressText, for: .normal)
    }
    
    private func handlePaymentSuccess(_ payment: Payment) {
        payButton.stopLoading()
        securityStatusLabel.textColor = .systemGreen
        securityStatusLabel.text = "Payment Processed Securely"
        
        // Track successful payment
        monitor.track(
            event: "payment_success",
            attributes: [
                "amount": payment.amount,
                "type": payment.type.rawValue
            ]
        )
        
        // Show success alert
        showAlert(
            title: "Payment Successful",
            message: "Transaction ID: \(payment.id)"
        )
    }
    
    private func handleError(_ error: Error) {
        payButton.stopLoading()
        securityStatusLabel.textColor = .systemRed
        
        // Track error
        monitor.error("Payment processing failed", error: error)
        
        // Show error alert
        showAlert(
            title: "Payment Failed",
            message: error.localizedDescription
        )
    }
    
    private func handleSecurityError(_ error: SecurityError) {
        payButton.stopLoading()
        payButton.isEnabled = false
        securityStatusLabel.textColor = .systemRed
        securityStatusLabel.text = error.localizedDescription
        
        // Track security error
        monitor.error("Security validation failed", error: error)
        
        // Show security alert
        showAlert(
            title: "Security Error",
            message: error.localizedDescription
        )
    }
    
    private func setupAccessibility() {
        amountTextField.accessibilityLabel = "Payment Amount"
        payButton.accessibilityLabel = "Process Payment"
        securityStatusLabel.accessibilityLabel = "Security Status"
        paymentHistoryTableView.accessibilityLabel = "Payment History"
    }
    
    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(
            title: title,
            message: message,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    
    // MARK: - Actions
    
    @IBAction private func securePaymentButtonTapped() {
        guard validateSecurityEnvironment() else {
            handleSecurityError(.securityValidationFailed)
            return
        }
        
        guard let amountText = amountTextField.text,
              let amount = Decimal(string: amountText) else {
            handleError(PaymentError.validation("Invalid amount"))
            return
        }
        
        payButton.startLoading()
        
        // Track payment attempt
        monitor.track(
            event: "payment_initiated",
            attributes: ["amount": amount]
        )
        
        // Process payment
        viewModel.processPayment(Payment(
            id: UUID().uuidString,
            amount: amount,
            currency: "USD",
            status: .pending,
            type: .rent,
            applicationId: "",
            userId: "",
            propertyId: ""
        ))
        .sink(
            receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.handleError(error)
                }
            },
            receiveValue: { [weak self] in
                self?.payButton.stopLoading()
            }
        )
        .store(in: &cancellables)
    }
}

// MARK: - UITableViewDataSource

extension PaymentViewController: UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return PaymentSection.allCases.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "PaymentCell", for: indexPath)
        
        guard let section = PaymentSection(rawValue: indexPath.row) else {
            return cell
        }
        
        // Configure cell based on section
        switch section {
        case .amount:
            cell.textLabel?.text = "Amount: $\(amountTextField.text ?? "0")"
        case .details:
            cell.textLabel?.text = "Payment Details"
        case .history:
            cell.textLabel?.text = "Transaction History"
        case .security:
            cell.textLabel?.text = "Security Status: \(securityStatusLabel.text ?? "Unknown")"
        }
        
        return cell
    }
}

// MARK: - UITableViewDelegate

extension PaymentViewController: UITableViewDelegate {
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
    }
}

// MARK: - UITextFieldDelegate

extension PaymentViewController: UITextFieldDelegate {
    func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        // Validate input is numeric
        let allowedCharacters = CharacterSet.decimalDigits
        let characterSet = CharacterSet(charactersIn: string)
        return allowedCharacters.isSuperset(of: characterSet)
    }
}