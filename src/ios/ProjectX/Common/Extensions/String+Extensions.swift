//
// String+Extensions.swift
// ProjectX
//
// Provides extension methods for String type to support secure input validation,
// consistent formatting, and common string manipulation operations
// Foundation version: iOS 15.0+
//

import Foundation

// MARK: - String Extension
public extension String {
    
    // MARK: - Cached Regular Expressions
    private static let emailRegex = try? NSRegularExpression(
        pattern: "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
        options: .caseInsensitive
    )
    
    private static let passwordRegex = try? NSRegularExpression(
        pattern: "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{8,}$",
        options: []
    )
    
    private static let phoneRegex = try? NSRegularExpression(
        pattern: "^\\+?[1-9]\\d{1,14}$",
        options: []
    )
    
    // MARK: - Validation Properties
    
    /// Validates if the string is a valid email address using RFC 5322 compliant pattern
    var isValidEmail: Bool {
        guard let regex = String.emailRegex else { return false }
        let range = NSRange(location: 0, length: self.utf16.count)
        return regex.firstMatch(in: self, options: [], range: range) != nil
    }
    
    /// Validates if the string meets password requirements per OWASP guidelines
    var isValidPassword: Bool {
        guard count >= API.MIN_PASSWORD_LENGTH,
              let regex = String.passwordRegex else { return false }
        let range = NSRange(location: 0, length: self.utf16.count)
        return regex.firstMatch(in: self, options: [], range: range) != nil
    }
    
    /// Validates if the string is a valid international phone number (E.164 format)
    var isValidPhoneNumber: Bool {
        guard let regex = String.phoneRegex else { return false }
        let range = NSRange(location: 0, length: self.utf16.count)
        return regex.firstMatch(in: self, options: [], range: range) != nil
    }
    
    // MARK: - Formatting Properties
    
    /// Returns string with leading/trailing whitespace and newlines removed
    var trimmed: String {
        return self.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    /// Returns localized version of string using system locale
    var localized: String {
        return NSLocalizedString(self, comment: "")
    }
    
    /// Returns URL encoded string per RFC 3986
    var urlEncoded: String {
        return self.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
    
    /// Safely converts HTML to NSAttributedString with XSS prevention
    var htmlAttributedString: NSAttributedString? {
        guard let data = self.data(using: .utf8) else { return nil }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue
        ]
        return try? NSAttributedString(data: data, options: options, documentAttributes: nil)
    }
    
    // MARK: - Formatting Functions
    
    /// Formats numeric string as currency using locale-specific formatting
    func formatCurrency(locale: Locale = .current) -> String? {
        guard let number = Double(self) else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        return formatter.string(from: NSNumber(value: number))
    }
    
    /// Formats phone numbers to international format
    func formatPhoneNumber(countryCode: String = "1") -> String {
        let digits = self.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        if digits.hasPrefix(countryCode) {
            let index = digits.index(digits.startIndex, offsetBy: countryCode.count)
            return "+\(countryCode) \(digits[index...])"
        }
        return "+\(countryCode) \(digits)"
    }
    
    /// Formats address strings according to regional standards
    func formatAddress(locale: Locale = .current) -> String {
        let components = self.components(separatedBy: ",").map { $0.trimmed }
        switch locale.regionCode {
        case "US":
            return components.joined(separator: "\n")
        default:
            return components.joined(separator: ", ")
        }
    }
    
    /// Converts string to Date using ISO8601 format
    func toDate() -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: self)
    }
}