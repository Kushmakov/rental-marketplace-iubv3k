//
// Logger.swift
// ProjectX
//
// A centralized logging utility that provides structured logging capabilities
// with thread-safe operations and system integration.
// Foundation version: iOS 15.0+
// os.log version: iOS 15.0+
//

import Foundation
import os.log

/// Global constants for logging configuration
private let LOG_DIRECTORY = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("logs")
private let MAX_LOG_FILE_SIZE = 10 * 1024 * 1024 // 10MB
private let MAX_LOG_FILES = 5

/// Enumeration of available log levels with associated metadata
public enum LogLevel: String {
    case debug = "DEBUG"
    case info = "INFO"
    case warning = "WARNING"
    case error = "ERROR"
    
    var osLogType: OSLogType {
        switch self {
        case .debug: return .debug
        case .info: return .info
        case .warning: return .default
        case .error: return .error
        }
    }
}

/// Thread-safe singleton class for centralized logging operations
public final class Logger {
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = Logger()
    
    private let dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
    private let dateFormatter: DateFormatter
    private var currentLogFile: URL?
    private let loggingQueue: DispatchQueue
    private let osLog: OSLog
    private var logBuffer: Data?
    private var uploadTimer: Timer?
    
    // MARK: - Initialization
    
    private init() {
        // Initialize date formatter
        dateFormatter = DateFormatter()
        dateFormatter.dateFormat = dateFormat
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        
        // Initialize logging queue
        loggingQueue = DispatchQueue(label: "com.projectx.logger", qos: .utility, attributes: .concurrent)
        
        // Initialize OS Log
        osLog = OSLog(subsystem: Bundle.main.bundleIdentifier ?? "com.projectx", category: "ProjectX")
        
        // Set up logging infrastructure
        setupLoggingInfrastructure()
        
        // Initialize upload timer if remote logging is enabled
        setupUploadTimer()
    }
    
    // MARK: - Public Methods
    
    /// Log a message with the specified level and metadata
    /// - Parameters:
    ///   - level: The severity level of the log
    ///   - message: The message to be logged
    ///   - file: The source file generating the log
    ///   - line: The line number in the source file
    ///   - function: The function generating the log
    public func log(
        _ level: LogLevel,
        _ message: String,
        file: String = #file,
        line: Int = #line,
        function: String = #function
    ) {
        loggingQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }
            
            let timestamp = self.dateFormatter.string(from: Date())
            let fileName = (file as NSString).lastPathComponent
            
            // Format log entry
            let logEntry = """
                [\(timestamp)] [\(level.rawValue)] [\(fileName):\(line)] [\(function)]
                \(message)
                
                """
            
            // Write to OS Log
            os_log(
                "%{public}@",
                log: self.osLog,
                type: level.osLogType,
                logEntry
            )
            
            // Write to file
            self.writeToFile(logEntry)
            
            // Check for log rotation
            self.checkAndRotateLogs()
        }
    }
    
    // MARK: - Private Methods
    
    private func setupLoggingInfrastructure() {
        guard let logDirectory = LOG_DIRECTORY else { return }
        
        do {
            // Create logs directory if it doesn't exist
            if !FileManager.default.fileExists(atPath: logDirectory.path) {
                try FileManager.default.createDirectory(
                    at: logDirectory,
                    withIntermediateDirectories: true,
                    attributes: nil
                )
            }
            
            // Initialize current log file
            currentLogFile = logDirectory.appendingPathComponent("projectx_\(Date().timeIntervalSince1970).log")
        } catch {
            os_log(
                "Failed to setup logging infrastructure: %{public}@",
                log: osLog,
                type: .error,
                error.localizedDescription
            )
        }
    }
    
    private func writeToFile(_ logEntry: String) {
        guard let logFile = currentLogFile else { return }
        
        do {
            if !FileManager.default.fileExists(atPath: logFile.path) {
                FileManager.default.createFile(atPath: logFile.path, contents: nil)
            }
            
            if let data = logEntry.data(using: .utf8) {
                let fileHandle = try FileHandle(forWritingTo: logFile)
                fileHandle.seekToEndOfFile()
                fileHandle.write(data)
                fileHandle.closeFile()
            }
        } catch {
            os_log(
                "Failed to write to log file: %{public}@",
                log: osLog,
                type: .error,
                error.localizedDescription
            )
        }
    }
    
    private func checkAndRotateLogs() {
        guard let logFile = currentLogFile else { return }
        
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: logFile.path)
            let fileSize = attributes[.size] as? Int ?? 0
            
            if fileSize > MAX_LOG_FILE_SIZE {
                rotateLogFiles()
            }
        } catch {
            os_log(
                "Failed to check log file size: %{public}@",
                log: osLog,
                type: .error,
                error.localizedDescription
            )
        }
    }
    
    private func rotateLogFiles() {
        guard let logDirectory = LOG_DIRECTORY else { return }
        
        do {
            // Get all log files
            let logFiles = try FileManager.default.contentsOfDirectory(
                at: logDirectory,
                includingPropertiesForKeys: [.creationDateKey],
                options: .skipsHiddenFiles
            ).filter { $0.pathExtension == "log" }
            
            // Sort by creation date
            let sortedFiles = try logFiles.sorted {
                let date1 = try $0.resourceValues(forKeys: [.creationDateKey]).creationDate ?? Date()
                let date2 = try $1.resourceValues(forKeys: [.creationDateKey]).creationDate ?? Date()
                return date1 > date2
            }
            
            // Remove oldest files if exceeding limit
            if sortedFiles.count >= MAX_LOG_FILES {
                for file in sortedFiles[MAX_LOG_FILES-1..<sortedFiles.count] {
                    try FileManager.default.removeItem(at: file)
                }
            }
            
            // Create new log file
            currentLogFile = logDirectory.appendingPathComponent("projectx_\(Date().timeIntervalSince1970).log")
            
        } catch {
            os_log(
                "Failed to rotate log files: %{public}@",
                log: osLog,
                type: .error,
                error.localizedDescription
            )
        }
    }
    
    private func setupUploadTimer() {
        uploadTimer = Timer.scheduledTimer(
            withTimeInterval: 3600, // Upload every hour
            repeats: true
        ) { [weak self] _ in
            self?.uploadLogs()
        }
    }
    
    private func uploadLogs() {
        guard let logDirectory = LOG_DIRECTORY,
              let baseURL = URL(string: API.BASE_URL) else { return }
        
        let uploadURL = baseURL.appendingPathComponent("/logs/upload")
        
        loggingQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                let logFiles = try FileManager.default.contentsOfDirectory(
                    at: logDirectory,
                    includingPropertiesForKeys: nil
                ).filter { $0.pathExtension == "log" }
                
                // Upload implementation would go here
                // This is a placeholder for the actual upload logic
                os_log(
                    "Would upload %d log files to %@",
                    log: self.osLog,
                    type: .debug,
                    logFiles.count,
                    uploadURL.absoluteString
                )
                
            } catch {
                os_log(
                    "Failed to upload logs: %{public}@",
                    log: self.osLog,
                    type: .error,
                    error.localizedDescription
                )
            }
        }
    }
}
```

This implementation provides a robust, thread-safe logging utility with the following features:

1. Singleton pattern for centralized logging
2. Multiple log levels (debug, info, warning, error)
3. Thread-safe operations using a concurrent dispatch queue
4. File-based logging with rotation based on size
5. Integration with system logging via os.log
6. Automatic log file cleanup to prevent disk space issues
7. Support for remote log upload (placeholder implementation)
8. Comprehensive error handling
9. ISO8601 timestamp formatting
10. Detailed metadata including file, line, and function information

The logger can be used throughout the application like this:

```swift
Logger.shared.log(.info, "User logged in successfully")
Logger.shared.log(.error, "Failed to load property details", file: #file, line: #line)