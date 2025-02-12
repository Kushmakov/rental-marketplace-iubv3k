//
// PaymentViewModel.swift
// ProjectX
//
// ViewModel for secure payment processing with comprehensive monitoring and PCI compliance
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
//

import Foundation
import Combine

// MARK: - Payment View State

public enum PaymentViewState: Equatable {
    case idle
    case loading(Progress)
    case validating
    case processing(Float)
    case success(Payment)
    case error(PaymentError)
    case securityError(SecurityError)
}

// MARK: - Payment Error Types

public enum PaymentError: Error, Equatable {
    case validation(String)
    case network(String)
    case security(SecurityError)
    case limit(String)
    case timeout(String)
    
    static func == (lhs: PaymentError, rhs: PaymentError) -> Bool {
        switch (lhs, rhs) {
        case (.validation(let l), .validation(let r)): return l == r
        case (.network(let l), .network(let r)): return l == r
        case (.security(let l), .security(let r)): return l == r
        case (.limit(let l), .limit(let r)): return l == r
        case (.timeout(let l), .timeout(let r)): return l == r
        default: return false
        }
    }
}

public enum SecurityError: Error, Equatable {
    case tokenExpired
    case invalidSignature
    case pciCompliance(String)
    case unauthorized
}

// MARK: - Payment View Model

@MainActor
public final class PaymentViewModel {
    
    // MARK: - Properties
    
    private let repository: PaymentRepository
    private(set) var state = CurrentValueSubject<PaymentViewState, Never>(.idle)
    private var cancellables = Set<AnyCancellable>()
    private let paymentCompletedSubject = PassthroughSubject<Void, Never>()
    private let securityValidator: PaymentSecurityValidator
    private let metricsTracker: PaymentMetricsTracker
    private let requestQueue: PaymentRequestQueue
    
    // MARK: - Constants
    
    private enum Constants {
        static let processingTimeout: TimeInterval = 30.0
        static let maxRetryAttempts = 3
        static let minimumAmount: Decimal = 1.0
        static let maximumAmount: Decimal = 50000.0
    }
    
    // MARK: - Initialization
    
    public init(repository: PaymentRepository,
                securityValidator: PaymentSecurityValidator,
                metricsTracker: PaymentMetricsTracker) {
        self.repository = repository
        self.securityValidator = securityValidator
        self.metricsTracker = metricsTracker
        self.requestQueue = PaymentRequestQueue(maxConcurrentRequests: 4)
        
        setupMetricsTracking()
    }
    
    // MARK: - Public Methods
    
    /// Process a payment with comprehensive security validation and monitoring
    /// - Parameter payment: Payment to process
    /// - Returns: Publisher that emits when payment is completed
    public func processPayment(_ payment: Payment) -> AnyPublisher<Void, Never> {
        state.send(.validating)
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(PaymentError.security(.unauthorized)))
                return
            }
            
            // Validate payment amount
            guard self.validatePaymentAmount(payment.amount) else {
                self.state.send(.error(.validation("Invalid payment amount")))
                promise(.failure(PaymentError.validation("Amount must be between \(Constants.minimumAmount) and \(Constants.maximumAmount)")))
                return
            }
            
            // Verify security token
            self.securityValidator.validateToken(payment.securityToken)
                .flatMap { _ -> AnyPublisher<Payment, Error> in
                    self.state.send(.processing(0.0))
                    return self.requestQueue.enqueue(payment)
                }
                .flatMap { validatedPayment -> AnyPublisher<Payment, Error> in
                    self.metricsTracker.trackPaymentStart(payment)
                    return self.repository.processPayment(validatedPayment)
                }
                .timeout(.seconds(Constants.processingTimeout), scheduler: DispatchQueue.main)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        switch completion {
                        case .finished:
                            self?.paymentCompletedSubject.send()
                            
                        case .failure(let error):
                            self?.handlePaymentError(error)
                        }
                    },
                    receiveValue: { [weak self] processedPayment in
                        self?.handlePaymentSuccess(processedPayment)
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    /// Fetch paginated payment history with filtering
    /// - Parameters:
    ///   - page: Page number
    ///   - limit: Items per page
    ///   - filter: Optional payment history filter
    /// - Returns: Publisher that emits paginated payment history
    public func getPaymentHistory(page: Int,
                                limit: Int,
                                filter: PaymentHistoryFilter) -> AnyPublisher<[Payment], Error> {
        state.send(.loading(Progress()))
        
        return repository.getPaymentHistory(page: page, limit: limit, filter: filter)
            .handleEvents(
                receiveOutput: { [weak self] payments in
                    self?.metricsTracker.trackHistoryFetch(count: payments.count)
                },
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.state.send(.error(.network(error.localizedDescription)))
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func validatePaymentAmount(_ amount: Decimal) -> Bool {
        return amount >= Constants.minimumAmount && amount <= Constants.maximumAmount
    }
    
    private func handlePaymentSuccess(_ payment: Payment) {
        metricsTracker.trackPaymentSuccess(payment)
        state.send(.success(payment))
    }
    
    private func handlePaymentError(_ error: Error) {
        metricsTracker.trackPaymentError(error)
        
        switch error {
        case let securityError as SecurityError:
            state.send(.securityError(securityError))
            
        case let paymentError as PaymentError:
            state.send(.error(paymentError))
            
        default:
            state.send(.error(.network(error.localizedDescription)))
        }
    }
    
    private func setupMetricsTracking() {
        NotificationCenter.default.publisher(for: .paymentMetricsCollected)
            .sink { [weak self] notification in
                if let metrics = notification.userInfo as? [String: Any] {
                    self?.metricsTracker.trackMetrics(metrics)
                }
            }
            .store(in: &cancellables)
    }
}

// MARK: - Notification Extension

private extension Notification.Name {
    static let paymentMetricsCollected = Notification.Name("com.projectx.paymentMetricsCollected")
}