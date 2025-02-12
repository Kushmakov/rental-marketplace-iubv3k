//
// PaymentService.swift
// ProjectX
//
// PCI DSS compliant payment service with Stripe integration
// Foundation version: iOS 15.0+
// Combine version: iOS 15.0+
// Stripe version: 23.x
//

import Foundation
import Combine
import Stripe

/// Thread-safe service handling all payment operations with PCI DSS compliance
@objc public final class PaymentService {
    
    // MARK: - Types
    
    /// Supported payment types in the system
    public enum PaymentType: String, Codable {
        case applicationFee
        case securityDeposit
        case rent
        case lateFee
    }
    
    /// Payment status tracking
    public enum PaymentStatus: String, Codable {
        case pending
        case authorized
        case captured
        case failed
        case refunded
        case disputed
    }
    
    /// Payment frequency options
    public enum PaymentFrequency: String, Codable {
        case oneTime
        case monthly
        case biWeekly
        case weekly
    }
    
    // MARK: - Constants
    
    private enum Constants {
        static let paymentTimeout: TimeInterval = 60.0
        static let maxRetryAttempts = 3
        static let minimumAmount: Decimal = 1.0
        static let maximumAmount: Decimal = 50000.0
        static let auditLogRetention: TimeInterval = 7776000 // 90 days
    }
    
    // MARK: - Properties
    
    private let apiClient: APIClient
    private let paymentHandler: STPPaymentHandler
    private let securityQueue: DispatchQueue
    private let retryPolicy: PaymentRetryPolicy
    private var cancellables: Set<AnyCancellable> = []
    
    // MARK: - Initialization
    
    public init() {
        self.apiClient = APIClient.shared
        self.paymentHandler = STPPaymentHandler.shared()
        self.securityQueue = DispatchQueue(label: "com.projectx.paymentservice", qos: .userInitiated)
        self.retryPolicy = PaymentRetryPolicy(maxAttempts: Constants.maxRetryAttempts)
        
        // Configure Stripe with PCI compliance settings
        Stripe.setDefaultPublishableKey(Configuration.stripePublishableKey)
        STPAPIClient.shared.configuration.publishableKey = Configuration.stripePublishableKey
    }
    
    // MARK: - Public Methods
    
    /// Processes a payment with comprehensive security measures and PCI compliance
    /// - Parameter request: Payment request details
    /// - Returns: Publisher that emits payment result or error
    public func processPayment(_ request: PaymentRequest) -> AnyPublisher<PaymentResponse, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(PaymentError.serviceUnavailable))
                return
            }
            
            self.securityQueue.async {
                // Validate payment request
                guard self.validatePaymentRequest(request) else {
                    promise(.failure(PaymentError.invalidRequest))
                    return
                }
                
                // Create payment intent
                self.createPaymentIntent(for: request)
                    .flatMap { intent -> AnyPublisher<PaymentResponse, Error> in
                        // Process payment through Stripe
                        return self.processStripePayment(intent: intent, request: request)
                    }
                    .retry(Constants.maxRetryAttempts, when: { error in
                        // Retry on specific network errors
                        return self.retryPolicy.shouldRetry(error: error)
                    })
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                // Log payment failure
                                self.logPaymentEvent(
                                    type: .failure,
                                    amount: request.amount,
                                    error: error
                                )
                                promise(.failure(error))
                            }
                        },
                        receiveValue: { response in
                            // Log successful payment
                            self.logPaymentEvent(
                                type: .success,
                                amount: request.amount,
                                reference: response.transactionId
                            )
                            promise(.success(response))
                        }
                    )
                    .store(in: &self.cancellables)
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Retrieves payment history with secure pagination
    /// - Parameters:
    ///   - page: Page number for pagination
    ///   - limit: Number of items per page
    /// - Returns: Publisher that emits paginated payment history
    public func getPaymentHistory(page: Int, limit: Int) -> AnyPublisher<[Payment], Error> {
        return apiClient.request(
            APIEndpoint.payments.history,
            parameters: ["page": page, "limit": limit]
        )
        .mapError { error -> Error in
            // Map API errors to payment-specific errors
            switch error {
            case .unauthorized:
                return PaymentError.unauthorized
            case .networkError:
                return PaymentError.networkError
            default:
                return error
            }
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func validatePaymentRequest(_ request: PaymentRequest) -> Bool {
        guard request.amount >= Constants.minimumAmount,
              request.amount <= Constants.maximumAmount,
              !request.paymentMethodId.isEmpty else {
            return false
        }
        return true
    }
    
    private func createPaymentIntent(for request: PaymentRequest) -> AnyPublisher<STPPaymentIntent, Error> {
        return apiClient.request(
            APIEndpoint.payments.createIntent,
            parameters: [
                "amount": request.amount,
                "currency": "usd",
                "payment_method": request.paymentMethodId,
                "payment_type": request.type.rawValue,
                "description": request.description
            ]
        )
        .mapError { PaymentError.intentCreationFailed($0) }
        .eraseToAnyPublisher()
    }
    
    private func processStripePayment(intent: STPPaymentIntent, request: PaymentRequest) -> AnyPublisher<PaymentResponse, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(PaymentError.serviceUnavailable))
                return
            }
            
            self.paymentHandler.confirmPayment(intent, with: nil) { status, _, error in
                switch status {
                case .succeeded:
                    let response = PaymentResponse(
                        transactionId: intent.stripeId,
                        status: .captured,
                        amount: request.amount,
                        timestamp: Date()
                    )
                    promise(.success(response))
                    
                case .failed:
                    promise(.failure(PaymentError.paymentFailed(error)))
                    
                case .canceled:
                    promise(.failure(PaymentError.paymentCanceled))
                    
                @unknown default:
                    promise(.failure(PaymentError.unknown))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    private func logPaymentEvent(type: PaymentEventType, amount: Decimal, error: Error? = nil, reference: String? = nil) {
        let event = PaymentEvent(
            type: type,
            amount: amount,
            timestamp: Date(),
            error: error?.localizedDescription,
            reference: reference
        )
        
        // Secure audit logging
        SecureLogger.shared.log(event, category: .payment)
    }
}

// MARK: - Supporting Types

private enum PaymentError: LocalizedError {
    case serviceUnavailable
    case invalidRequest
    case unauthorized
    case networkError
    case intentCreationFailed(Error)
    case paymentFailed(Error?)
    case paymentCanceled
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .serviceUnavailable:
            return "Payment service is temporarily unavailable"
        case .invalidRequest:
            return "Invalid payment request"
        case .unauthorized:
            return "Unauthorized payment request"
        case .networkError:
            return "Network error occurred during payment"
        case .intentCreationFailed(let error):
            return "Failed to create payment intent: \(error.localizedDescription)"
        case .paymentFailed(let error):
            return "Payment failed: \(error?.localizedDescription ?? "Unknown error")"
        case .paymentCanceled:
            return "Payment was canceled"
        case .unknown:
            return "An unknown error occurred"
        }
    }
}

private enum PaymentEventType {
    case success
    case failure
}

private struct PaymentEvent: Codable {
    let type: PaymentEventType
    let amount: Decimal
    let timestamp: Date
    let error: String?
    let reference: String?
}

private struct PaymentRequest: Codable {
    let amount: Decimal
    let paymentMethodId: String
    let type: PaymentType
    let description: String
}

private struct PaymentResponse: Codable {
    let transactionId: String
    let status: PaymentStatus
    let amount: Decimal
    let timestamp: Date
}

private struct Payment: Codable {
    let id: String
    let type: PaymentType
    let status: PaymentStatus
    let amount: Decimal
    let frequency: PaymentFrequency?
    let createdAt: Date
    let updatedAt: Date
}