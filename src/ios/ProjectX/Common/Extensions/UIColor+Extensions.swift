//
// UIColor+Extensions.swift
// ProjectX
//
// Provides UIColor extensions for Material Design 3.0 color system with dynamic color support
// Foundation version: iOS 15.0+
//

import UIKit

// MARK: - UIColor Extension
extension UIColor {
    
    // MARK: - Private Cache
    private static var dynamicColorCache: [String: UIColor] = [:]
    
    // MARK: - Utility Functions
    
    /// Creates a dynamic color that adapts to light/dark mode with caching for performance
    /// - Parameters:
    ///   - light: Color for light mode
    ///   - dark: Color for dark mode
    /// - Returns: Color that automatically adapts based on interface style
    @inline(__always)
    static func dynamicColor(light: UIColor, dark: UIColor) -> UIColor {
        let cacheKey = "\(light.description)_\(dark.description)"
        
        if let cachedColor = dynamicColorCache[cacheKey] {
            return cachedColor
        }
        
        let color = UIColor(dynamicProvider: { traitCollection in
            switch traitCollection.userInterfaceStyle {
            case .light, .unspecified:
                return light
            case .dark:
                return dark
            @unknown default:
                return light
            }
        })
        
        dynamicColorCache[cacheKey] = color
        return color
    }
    
    /// Creates a new color with specified alpha while preserving dynamic behavior
    /// - Parameter alpha: Target alpha value
    /// - Returns: New color with specified alpha
    func withAlpha(_ alpha: CGFloat) -> UIColor {
        return withAlphaComponent(alpha)
    }
    
    // MARK: - Primary Colors
    
    /// Primary brand color
    static let primary = dynamicColor(
        light: UIColor(red: 0.0, green: 0.47, blue: 0.95, alpha: 1.0),
        dark: UIColor(red: 0.47, green: 0.71, blue: 1.0, alpha: 1.0)
    )
    
    /// Primary variant color
    static let primaryVariant = dynamicColor(
        light: UIColor(red: 0.0, green: 0.32, blue: 0.71, alpha: 1.0),
        dark: UIColor(red: 0.71, green: 0.84, blue: 1.0, alpha: 1.0)
    )
    
    /// Color for content on primary color
    static let onPrimary = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    // MARK: - Secondary Colors
    
    /// Secondary brand color
    static let secondary = dynamicColor(
        light: UIColor(red: 0.0, green: 0.59, blue: 0.53, alpha: 1.0),
        dark: UIColor(red: 0.47, green: 0.82, blue: 0.76, alpha: 1.0)
    )
    
    /// Secondary variant color
    static let secondaryVariant = dynamicColor(
        light: UIColor(red: 0.0, green: 0.44, blue: 0.4, alpha: 1.0),
        dark: UIColor(red: 0.71, green: 0.91, blue: 0.87, alpha: 1.0)
    )
    
    /// Color for content on secondary color
    static let onSecondary = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    // MARK: - Accent Colors
    
    /// Accent color for emphasis
    static let accent = dynamicColor(
        light: UIColor(red: 0.96, green: 0.26, blue: 0.21, alpha: 1.0),
        dark: UIColor(red: 1.0, green: 0.58, blue: 0.54, alpha: 1.0)
    )
    
    /// Accent variant color
    static let accentVariant = dynamicColor(
        light: UIColor(red: 0.77, green: 0.12, blue: 0.08, alpha: 1.0),
        dark: UIColor(red: 1.0, green: 0.72, blue: 0.7, alpha: 1.0)
    )
    
    /// Color for content on accent color
    static let onAccent = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    // MARK: - Background Colors
    
    /// Main background color
    static let background = dynamicColor(
        light: UIColor(red: 0.98, green: 0.98, blue: 0.98, alpha: 1.0),
        dark: UIColor(red: 0.12, green: 0.12, blue: 0.12, alpha: 1.0)
    )
    
    /// Color for content on background
    static let onBackground = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87),
        dark: UIColor.white
    )
    
    // MARK: - Surface Colors
    
    /// Surface color for cards and elevated surfaces
    static let surface = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.16, green: 0.16, blue: 0.16, alpha: 1.0)
    )
    
    /// Alternative surface color
    static let surfaceVariant = dynamicColor(
        light: UIColor(red: 0.95, green: 0.95, blue: 0.95, alpha: 1.0),
        dark: UIColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1.0)
    ).withAlpha(UI.SHADOW_OPACITY)
    
    /// Color for content on surface
    static let onSurface = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87),
        dark: UIColor.white
    )
    
    // MARK: - State Colors
    
    /// Error state color
    static let error = dynamicColor(
        light: UIColor(red: 0.93, green: 0.12, blue: 0.14, alpha: 1.0),
        dark: UIColor(red: 1.0, green: 0.42, blue: 0.42, alpha: 1.0)
    )
    
    /// Background color for error states
    static let errorContainer = dynamicColor(
        light: UIColor(red: 1.0, green: 0.92, blue: 0.92, alpha: 1.0),
        dark: UIColor(red: 0.29, green: 0.0, blue: 0.0, alpha: 1.0)
    )
    
    /// Color for content on error color
    static let onError = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    /// Success state color
    static let success = dynamicColor(
        light: UIColor(red: 0.0, green: 0.78, blue: 0.33, alpha: 1.0),
        dark: UIColor(red: 0.47, green: 0.87, blue: 0.47, alpha: 1.0)
    )
    
    /// Background color for success states
    static let successContainer = dynamicColor(
        light: UIColor(red: 0.9, green: 1.0, blue: 0.9, alpha: 1.0),
        dark: UIColor(red: 0.0, green: 0.24, blue: 0.0, alpha: 1.0)
    )
    
    /// Color for content on success color
    static let onSuccess = dynamicColor(
        light: UIColor.white,
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    /// Warning state color
    static let warning = dynamicColor(
        light: UIColor(red: 1.0, green: 0.67, blue: 0.0, alpha: 1.0),
        dark: UIColor(red: 1.0, green: 0.82, blue: 0.47, alpha: 1.0)
    )
    
    /// Background color for warning states
    static let warningContainer = dynamicColor(
        light: UIColor(red: 1.0, green: 0.95, blue: 0.85, alpha: 1.0),
        dark: UIColor(red: 0.29, green: 0.19, blue: 0.0, alpha: 1.0)
    )
    
    /// Color for content on warning color
    static let onWarning = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87),
        dark: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87)
    )
    
    // MARK: - Text Colors
    
    /// Primary text color
    static let textPrimary = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.87),
        dark: UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.87)
    )
    
    /// Secondary text color
    static let textSecondary = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.6),
        dark: UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.6)
    )
    
    /// Disabled text color
    static let textDisabled = dynamicColor(
        light: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.38),
        dark: UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.38)
    )
}