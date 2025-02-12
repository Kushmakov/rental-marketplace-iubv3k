//
// NetworkReachability.swift
// ProjectX
//
// A comprehensive network reachability monitor with active verification
// Foundation version: iOS 15.0+
// Network version: iOS 15.0+
// Combine version: iOS 15.0+
//

import Foundation
import Network
import Combine

/// Global constants for network monitoring configuration
private let REACHABILITY_NOTIFICATION = Notification.Name("NetworkReachabilityStatusChanged")
private let CONNECTIVITY_CHECK_TIMEOUT: TimeInterval = 5.0
private let MONITORING_QUEUE_LABEL = "com.projectx.networkmonitoring"
private let CONNECTIVITY_CHECK_HOST = "api.projectx.com"

/// Enumeration of possible network connection states
@objc public enum NetworkStatus: Int {
    case connected
    case disconnected
    case connecting
    case limited
    
    var description: String {
        switch self {
        case .connected: return "Connected"
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting"
        case .limited: return "Limited"
        }
    }
}

/// Enumeration of network connection types
@objc public enum ConnectionType: Int {
    case wifi
    case cellular
    case wired
    case vpn
    case unknown
    
    var description: String {
        switch self {
        case .wifi: return "WiFi"
        case .cellular: return "Cellular"
        case .wired: return "Wired"
        case .vpn: return "VPN"
        case .unknown: return "Unknown"
        }
    }
}

/// Thread-safe singleton class for network reachability monitoring
@objc public final class NetworkReachability: NSObject {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = NetworkReachability()
    
    private let pathMonitor: NWPathMonitor
    private let monitorQueue: DispatchQueue
    
    /// Publishers for reactive status updates
    public private(set) var networkStatus = CurrentValueSubject<NetworkStatus, Never>(.disconnected)
    public private(set) var connectionType = CurrentValueSubject<ConnectionType, Never>(.unknown)
    
    /// Current reachability state
    @objc public private(set) var isReachable: Bool = false {
        didSet {
            if oldValue != isReachable {
                NotificationCenter.default.post(name: REACHABILITY_NOTIFICATION, object: self)
            }
        }
    }
    
    private var cancellables = Set<AnyCancellable>()
    private var connectivityCheckTimer: Timer?
    
    // MARK: - Initialization
    
    private override init() {
        self.monitorQueue = DispatchQueue(label: MONITORING_QUEUE_LABEL, qos: .utility)
        self.pathMonitor = NWPathMonitor()
        
        super.init()
        
        setupNetworkMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Starts network reachability monitoring
    public func startMonitoring() {
        Logger.shared.log(.info, "Starting network reachability monitoring")
        
        monitorQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.pathMonitor.start(queue: self.monitorQueue)
            self.setupConnectivityCheck()
        }
    }
    
    /// Stops network reachability monitoring
    public func stopMonitoring() {
        Logger.shared.log(.info, "Stopping network reachability monitoring")
        
        pathMonitor.cancel()
        connectivityCheckTimer?.invalidate()
        connectivityCheckTimer = nil
        cancellables.removeAll()
        
        networkStatus.send(.disconnected)
        connectionType.send(.unknown)
        isReachable = false
    }
    
    // MARK: - Private Methods
    
    private func setupNetworkMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            
            // Update connection type
            let type = self.determineConnectionType(path)
            self.connectionType.send(type)
            
            // Update network status
            if path.status == .satisfied {
                self.networkStatus.send(.connected)
                self.isReachable = true
                Logger.shared.log(.info, "Network connected via \(type.description)")
            } else {
                self.networkStatus.send(.disconnected)
                self.isReachable = false
                Logger.shared.log(.warning, "Network disconnected")
            }
        }
    }
    
    private func setupConnectivityCheck() {
        connectivityCheckTimer?.invalidate()
        connectivityCheckTimer = Timer.scheduledTimer(
            withTimeInterval: CONNECTIVITY_CHECK_TIMEOUT,
            repeats: true
        ) { [weak self] _ in
            self?.performConnectivityCheck()
        }
    }
    
    private func performConnectivityCheck() -> AnyPublisher<Bool, Never> {
        guard let url = URL(string: "https://\(CONNECTIVITY_CHECK_HOST)/health") else {
            return Just(false).eraseToAnyPublisher()
        }
        
        let request = URLRequest(url: url, timeoutInterval: CONNECTIVITY_CHECK_TIMEOUT)
        
        return URLSession.shared.dataTaskPublisher(for: request)
            .map { data, response -> Bool in
                guard let httpResponse = response as? HTTPURLResponse else {
                    return false
                }
                return (200...299).contains(httpResponse.statusCode)
            }
            .catch { error -> Just<Bool> in
                Logger.shared.log(.error, "Connectivity check failed: \(error.localizedDescription)")
                return Just(false)
            }
            .handleEvents(receiveOutput: { [weak self] isConnected in
                guard let self = self else { return }
                
                if !isConnected {
                    self.networkStatus.send(.limited)
                    Logger.shared.log(.warning, "Limited connectivity detected")
                }
            })
            .eraseToAnyPublisher()
    }
    
    private func determineConnectionType(_ path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .wired
        } else if path.usesInterfaceType(.other) {
            // Check for VPN
            if path.isExpensive && path.supportsDNS {
                return .vpn
            }
            return .unknown
        }
        return .unknown
    }
}