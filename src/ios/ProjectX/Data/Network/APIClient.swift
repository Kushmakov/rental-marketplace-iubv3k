//
// APIClient.swift
// ProjectX
//
// Core networking client with comprehensive security, monitoring, and caching
// Foundation version: iOS 15.0+
// Alamofire version: 5.8+
// DatadogSDK version: 2.0+
//

import Foundation
import Combine
import Alamofire
import DatadogCore

/// Thread-safe singleton networking client with comprehensive monitoring and security controls
@objc public final class APIClient {
    
    // MARK: - Constants
    
    private enum Constants {
        static let requestTimeout: TimeInterval = 30.0
        static let maxRetries: Int = 3
        static let cacheExpiration: TimeInterval = 300.0
        static let maxConcurrentRequests: Int = 4
        static let monitoringSampleRate: Double = 0.1
        static let memoryCacheSize: Int = 50 * 1024 * 1024 // 50MB
        static let diskCacheSize: Int = 100 * 1024 * 1024  // 100MB
    }
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = APIClient()
    
    private let session: Session
    private let interceptor: NetworkInterceptor
    private let decoder: JSONDecoder
    private let cache: URLCache
    private let requestQueue: OperationQueue
    private let monitor: DatadogCore.Monitor
    
    // MARK: - Initialization
    
    private init() {
        // Initialize network interceptor with security controls
        self.interceptor = NetworkInterceptor()
        
        // Configure secure session with certificate pinning
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = Constants.requestTimeout
        configuration.timeoutIntervalForResource = Constants.requestTimeout * 2
        configuration.httpMaximumConnectionsPerHost = Constants.maxConcurrentRequests
        
        // Initialize Alamofire session with interceptor
        self.session = Session(
            configuration: configuration,
            interceptor: interceptor,
            serverTrustManager: ServerTrustManager(evaluators: [
                "api.projectx.com": PinnedCertificatesTrustEvaluator()
            ])
        )
        
        // Configure JSON decoder with date handling
        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        
        // Initialize URL cache with size limits
        self.cache = URLCache(
            memoryCapacity: Constants.memoryCacheSize,
            diskCapacity: Constants.diskCacheSize,
            diskPath: "com.projectx.network.cache"
        )
        
        // Configure request queue with QoS
        self.requestQueue = OperationQueue()
        requestQueue.maxConcurrentOperationCount = Constants.maxConcurrentRequests
        requestQueue.qualityOfService = .userInitiated
        
        // Initialize performance monitoring
        self.monitor = DatadogCore.Monitor(
            configuration: .init(
                sampleRate: Constants.monitoringSampleRate,
                serviceName: "ios-network-client"
            )
        )
    }
    
    // MARK: - Public Methods
    
    /// Performs a type-safe API request with comprehensive error handling and monitoring
    /// - Parameters:
    ///   - endpoint: Type-safe API endpoint
    ///   - parameters: Optional request parameters
    ///   - priority: Request priority for queue management
    /// - Returns: Publisher that emits decoded response or error
    @discardableResult
    public func request<T: Decodable>(
        _ endpoint: APIEndpoint,
        parameters: Encodable? = nil,
        priority: Operation.QueuePriority = .normal
    ) -> AnyPublisher<T, APIError> {
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.custom("APIClient deallocated")))
                return
            }
            
            // Start request monitoring
            let requestId = UUID().uuidString
            self.monitor.startRequest(id: requestId)
            
            // Check URL construction
            let urlResult = APIEndpoint.url(for: endpoint)
            guard case .success(let url) = urlResult else {
                if case .failure(let error) = urlResult {
                    promise(.failure(error))
                }
                return
            }
            
            // Prepare request with security headers
            var request = URLRequest(url: url)
            request.allHTTPHeaderFields = APIEndpoint.headers(for: endpoint)
            
            if let parameters = parameters {
                do {
                    request.httpBody = try JSONEncoder().encode(parameters)
                } catch {
                    promise(.failure(.custom("Failed to encode parameters")))
                    return
                }
            }
            
            // Execute request through session
            let operation = BlockOperation {
                self.session.request(request)
                    .validate()
                    .responseData { response in
                        // Track request completion
                        self.monitor.endRequest(id: requestId, response: response.response)
                        
                        switch response.result {
                        case .success(let data):
                            // Process response through interceptor
                            let result = self.interceptor.handleResponse(
                                response.response!,
                                data: data
                            )
                            
                            switch result {
                            case .success(let validData):
                                do {
                                    let decoded = try self.decoder.decode(T.self, from: validData)
                                    promise(.success(decoded))
                                } catch {
                                    promise(.failure(.decodingError(error)))
                                }
                                
                            case .failure(let error):
                                promise(.failure(error))
                            }
                            
                        case .failure(let error):
                            promise(.failure(.networkError(error)))
                        }
                    }
            }
            
            // Set operation priority and add to queue
            operation.queuePriority = priority
            self.requestQueue.addOperation(operation)
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Handles file uploads with progress tracking and monitoring
    /// - Parameters:
    ///   - endpoint: Upload endpoint
    ///   - fileData: File data to upload
    ///   - mimeType: File MIME type
    ///   - priority: Upload priority
    /// - Returns: Publisher that emits upload progress and result
    public func upload(
        to endpoint: APIEndpoint,
        fileData: Data,
        mimeType: String,
        priority: Operation.QueuePriority = .normal
    ) -> AnyPublisher<UploadResponse, APIError> {
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.custom("APIClient deallocated")))
                return
            }
            
            // Start upload monitoring
            let uploadId = UUID().uuidString
            self.monitor.startUpload(id: uploadId)
            
            // Check URL construction
            let urlResult = APIEndpoint.url(for: endpoint)
            guard case .success(let url) = urlResult else {
                if case .failure(let error) = urlResult {
                    promise(.failure(error))
                }
                return
            }
            
            // Configure upload request
            let operation = BlockOperation {
                self.session.upload(
                    multipartFormData: { formData in
                        formData.append(
                            fileData,
                            withName: "file",
                            fileName: "upload.file",
                            mimeType: mimeType
                        )
                    },
                    to: url,
                    headers: HTTPHeaders(APIEndpoint.headers(for: endpoint))
                )
                .uploadProgress { progress in
                    self.monitor.trackUploadProgress(
                        id: uploadId,
                        progress: progress.fractionCompleted
                    )
                }
                .responseData { response in
                    // Track upload completion
                    self.monitor.endUpload(id: uploadId, response: response.response)
                    
                    switch response.result {
                    case .success(let data):
                        let result = self.interceptor.handleResponse(
                            response.response!,
                            data: data
                        )
                        
                        switch result {
                        case .success(let validData):
                            do {
                                let decoded = try self.decoder.decode(UploadResponse.self, from: validData)
                                promise(.success(decoded))
                            } catch {
                                promise(.failure(.decodingError(error)))
                            }
                            
                        case .failure(let error):
                            promise(.failure(error))
                        }
                        
                    case .failure(let error):
                        promise(.failure(.networkError(error)))
                    }
                }
            }
            
            // Set operation priority and add to queue
            operation.queuePriority = priority
            self.requestQueue.addOperation(operation)
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Updates authentication token with validation
    /// - Parameter token: New authentication token
    public func updateAuthToken(_ token: String) {
        interceptor.updateToken(token)
    }
}

// MARK: - Supporting Types

/// Response type for file uploads
public struct UploadResponse: Decodable {
    public let fileId: String
    public let url: URL
    public let mimeType: String
    public let size: Int
}