//
// Date+Extensions.swift
// ProjectX
//
// Thread-safe and timezone-aware Date extensions for rental marketplace functionality
// Foundation version: iOS 15.0+
//

import Foundation

extension Date {
    // MARK: - Private Properties
    
    private static let dateFormatterCache = NSCache<NSString, DateFormatter>()
    private static let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    
    // MARK: - Public Properties
    
    var isInPast: Bool {
        return self < Date()
    }
    
    var isInFuture: Bool {
        return self > Date()
    }
    
    var startOfDay: Date {
        return Calendar.current.startOfDay(for: self)
    }
    
    var endOfDay: Date {
        var components = DateComponents()
        components.day = 1
        components.second = -1
        return Calendar.current.date(byAdding: components, to: startOfDay) ?? self
    }
    
    // MARK: - Formatting Methods
    
    func toString(format: String) -> String {
        let key = NSString(string: format)
        let formatter: DateFormatter
        
        if let cachedFormatter = Date.dateFormatterCache.object(forKey: key) {
            formatter = cachedFormatter
        } else {
            formatter = DateFormatter()
            formatter.dateFormat = format
            formatter.locale = Locale.current
            Date.dateFormatterCache.setObject(formatter, forKey: key)
        }
        
        return formatter.string(from: self)
    }
    
    func toAPIString() -> String {
        return Date.iso8601Formatter.string(from: self)
    }
    
    func toDisplayString() -> String {
        let key = NSString(string: "displayFormat")
        let formatter: DateFormatter
        
        if let cachedFormatter = Date.dateFormatterCache.object(forKey: key) {
            formatter = cachedFormatter
        } else {
            formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            formatter.locale = Locale.current
            Date.dateFormatterCache.setObject(formatter, forKey: key)
        }
        
        return formatter.string(from: self)
    }
    
    // MARK: - Date Manipulation Methods
    
    func addDays(_ days: Int) -> Date {
        var components = DateComponents()
        components.day = days
        return Calendar.current.date(byAdding: components, to: self) ?? self
    }
    
    func addMonths(_ months: Int) -> Date {
        var components = DateComponents()
        components.month = months
        return Calendar.current.date(byAdding: components, to: self) ?? self
    }
    
    func daysBetween(_ date: Date) -> Int {
        let calendar = Calendar.current
        let normalizedSelf = calendar.startOfDay(for: self)
        let normalizedDate = calendar.startOfDay(for: date)
        
        guard let days = calendar.dateComponents([.day], from: normalizedSelf, to: normalizedDate).day else {
            return 0
        }
        
        return abs(days)
    }
    
    func monthsBetween(_ date: Date) -> Int {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.month], from: self, to: date)
        return abs(components.month ?? 0)
    }
    
    // MARK: - Rental Specific Methods
    
    func isWithinLeasePeriod(startDate: Date, endDate: Date) -> Bool {
        let calendar = Calendar.current
        let normalizedSelf = calendar.startOfDay(for: self)
        let normalizedStart = calendar.startOfDay(for: startDate)
        let normalizedEnd = calendar.startOfDay(for: endDate)
        
        return normalizedSelf >= normalizedStart && normalizedSelf <= normalizedEnd
    }
    
    func nextPaymentDate(lastPaymentDate: Date) -> Date {
        let calendar = Calendar.current
        let normalizedLast = calendar.startOfDay(for: lastPaymentDate)
        
        // Add one month to last payment date
        var components = DateComponents()
        components.month = 1
        
        guard let nextDate = calendar.date(byAdding: components, to: normalizedLast) else {
            return normalizedLast
        }
        
        // Handle edge cases for month-end dates
        let lastDayOfMonth = calendar.range(of: .day, in: .month, for: nextDate)?.count ?? 28
        
        components = calendar.dateComponents([.year, .month, .day], from: normalizedLast)
        if components.day == lastDayOfMonth {
            // If last payment was on month-end, next payment should also be on month-end
            components.month = (components.month ?? 1) + 1
            components.day = calendar.range(of: .day, in: .month, for: nextDate)?.count ?? 28
            return calendar.date(from: components) ?? nextDate
        }
        
        return nextDate
    }
}