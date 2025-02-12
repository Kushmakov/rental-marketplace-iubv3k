//
// PaymentRepository.swift
// ProjectX
//
// PCI DSS compliant payment repository with comprehensive security and monitoring
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
//

import Foundation
import Combine

// MARK: - Payment Error Enumeration

public enum PaymentError: Error {
    case invalidAmount
    case paymentFailed(Error?)
    case networkError(Error)
    case invalidPaymentMethod
    case securityValidationFailed
    case duplicateTransaction
    case rateLimitExceeded
    case serverError
}

// MARK: - Payment Constants

private struct PaymentConstants {
    static let maxRetryAttempts = 3
    static let requestTimeout = 30.0
    static let maxTransactionAmount = 100000.0
    static let minTransactionAmount = 1.0
    static let auditLogRetention: TimeInterval = 7776000 // 90 days
    static let securityValidationTimeout = 10.0
}

// MARK: - Payment History Filter

public struct PaymentHistoryFilter {
    let startDate: Date?
    let endDate: Date?
    let status: PaymentStatus?
    let type: PaymentType?
    let minAmount: Decimal?
    let maxAmount: Decimal?
}

// MARK: - Payment Repository Protocol

public protocol PaymentRepository {
    /// Process a payment with comprehensive security validation
    func processPayment(_ payment: Payment) -> AnyPublisher<Payment, Error>
    
    /// Retrieve paginated payment history with filtering
    func getPaymentHistory(page: Int, limit: Int, filter: PaymentHistoryFilter?) -> AnyPublisher<[Payment], Error>
}

// MARK: - Payment Repository Implementation

public final class PaymentRepositoryImpl: PaymentRepository {
    
    // MARK: - Properties
    
    private let paymentService: PaymentService
    private let processedTransactions: Set<String>
    private let serialQueue: DispatchQueue
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    public init(paymentService: PaymentService) {
        self.paymentService = paymentService
        self.processedTransactions = Set<String>()
        self.serialQueue = DispatchQueue(label: "com.projectx.paymentrepository",
                                       qos: .userInitiated)
        
        setupMonitoring()
    }
    
    // MARK: - Public Methods
    
    public func processPayment(_ payment: Payment) -> AnyPublisher<Payment, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(PaymentError.serverError))
                return
            }
            
            self.serialQueue.async {
                // Validate payment amount
                guard self.validatePaymentAmount(payment.amount) else {
                    promise(.failure(PaymentError.invalidAmount))
                    return
                }
                
                // Check for duplicate transaction
                guard !self.isDuplicateTransaction(payment.id) else {
                    promise(.failure(PaymentError.duplicateTransaction))
                    return
                }
                
                // Perform security validation
                self.performSecurityValidation(payment)
                    .flatMap { validatedPayment -> AnyPublisher<Payment, Error> in
                        // Process payment through service
                        return self.paymentService.processPayment(validatedPayment)
                            .mapError { error -> Error in
                                self.logPaymentError(error, payment: payment)
                                return PaymentError.paymentFailed(error)
                            }
                            .handleEvents(
                                receiveOutput: { processedPayment in
                                    self.trackSuccessfulPayment(processedPayment)
                                }
                            )
                            .eraseToAnyPublisher()
                    }
                    .receive(on: DispatchQueue.main)
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                promise(.failure(error))
                            }
                        },
                        receiveValue: { processedPayment in
                            promise(.success(processedPayment))
                        }
                    )
                    .store(in: &self.cancellables)
            }
        }
        .eraseToAnyPublisher()
    }
    
    public func getPaymentHistory(page: Int, limit: Int, filter: PaymentHistoryFilter?) -> AnyPublisher<[Payment], Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(PaymentError.serverError))
                return
            }
            
            // Validate pagination parameters
            guard self.validatePaginationParameters(page: page, limit: limit) else {
                promise(.failure(PaymentError.invalidAmount))
                return
            }
            
            self.paymentService.getPaymentHistory(page: page, limit: limit)
                .map { payments -> [Payment] in
                    // Apply filters if provided
                    guard let filter = filter else { return payments }
                    return self.applyHistoryFilter(payments, filter: filter)
                }
                .handleEvents(receiveOutput: { payments in
                    self.logPaymentHistoryAccess(page: page, count: payments.count)
                })
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            promise(.failure(PaymentError.networkError(error)))
                        }
                    },
                    receiveValue: { filteredPayments in
                        promise(.success(filteredPayments))
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func validatePaymentAmount(_ amount: Decimal) -> Bool {
        return amount >= PaymentConstants.minTransactionAmount &&
               amount <= PaymentConstants.maxTransactionAmount
    }
    
    private func isDuplicateTransaction(_ transactionId: String) -> Bool {
        return processedTransactions.contains(transactionId)
    }
    
    private func performSecurityValidation(_ payment: Payment) -> AnyPublisher<Payment, Error> {
        return Future { promise in
            // Perform comprehensive security checks
            do {
                try payment.validate()
                promise(.success(payment))
            } catch {
                promise(.failure(PaymentError.securityValidationFailed))
            }
        }
        .timeout(.seconds(PaymentConstants.securityValidationTimeout), scheduler: serialQueue)
        .eraseToAnyPublisher()
    }
    
    private func validatePaginationParameters(page: Int, limit: Int) -> Bool {
        return page > 0 && limit > 0 && limit <= 100
    }
    
    private func applyHistoryFilter(_ payments: [Payment], filter: PaymentHistoryFilter) -> [Payment] {
        return payments.filter { payment in
            var isIncluded = true
            
            if let startDate = filter.startDate {
                isIncluded = isIncluded && payment.createdAt >= startDate
            }
            
            if let endDate = filter.endDate {
                isIncluded = isIncluded && payment.createdAt <= endDate
            }
            
            if let status = filter.status {
                isIncluded = isIncluded && payment.status == status
            }
            
            if let type = filter.type {
                isIncluded = isIncluded && payment.type == type
            }
            
            if let minAmount = filter.minAmount {
                isIncluded = isIncluded && payment.amount >= minAmount
            }
            
            if let maxAmount = filter.maxAmount {
                isIncluded = isIncluded && payment.amount <= maxAmount
            }
            
            return isIncluded
        }
    }
    
    private func setupMonitoring() {
        // Configure payment monitoring and metrics collection
        NotificationCenter.default.publisher(for: .paymentProcessed)
            .sink { [weak self] notification in
                if let payment = notification.object as? Payment {
                    self?.trackPaymentMetrics(payment)
                }
            }
            .store(in: &cancellables)
    }
    
    private func trackSuccessfulPayment(_ payment: Payment) {
        serialQueue.async {
            self.paymentService.logPaymentActivity(
                payment: payment,
                eventType: "payment_success"
            )
        }
    }
    
    private func logPaymentError(_ error: Error, payment: Payment) {
        serialQueue.async {
            self.paymentService.logPaymentActivity(
                payment: payment,
                eventType: "payment_error",
                error: error
            )
        }
    }
    
    private func logPaymentHistoryAccess(page: Int, count: Int) {
        serialQueue.async {
            self.paymentService.logPaymentActivity(
                eventType: "history_access",
                metadata: ["page": "\(page)", "count": "\(count)"]
            )
        }
    }
    
    private func trackPaymentMetrics(_ payment: Payment) {
        // Track payment metrics for monitoring
        let metrics: [String: Any] = [
            "amount": payment.amount,
            "type": payment.type.rawValue,
            "status": payment.status.rawValue,
            "processing_time": Date().timeIntervalSince(payment.createdAt)
        ]
        
        NotificationCenter.default.post(
            name: .paymentMetricsCollected,
            object: nil,
            userInfo: metrics
        )
    }
}

// MARK: - Notification Extension

private extension Notification.Name {
    static let paymentProcessed = Notification.Name("com.projectx.paymentProcessed")
    static let paymentMetricsCollected = Notification.Name("com.projectx.paymentMetricsCollected")
}