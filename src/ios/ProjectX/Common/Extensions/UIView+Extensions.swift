//
// UIView+Extensions.swift
// ProjectX
//
// Thread-safe UIView extensions for common UI operations and styling
// UIKit version: iOS 15.0+
//

import UIKit

// MARK: - UIView Extensions
public extension UIView {
    
    /// Adds a shadow to the view using predefined shadow properties
    func addShadow() {
        // Ensure thread safety for UI updates
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.addShadow()
            }
            return
        }
        
        layer.shadowOpacity = UI.SHADOW_OPACITY
        layer.shadowRadius = UI.SHADOW_RADIUS
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowColor = UIColor.black.cgColor
        
        // Enable rasterization for better performance
        layer.shouldRasterize = true
        layer.rasterizationScale = UIScreen.main.scale
    }
    
    /// Rounds the corners of the view with an optional custom radius
    /// - Parameter radius: Optional custom corner radius. Uses UI.CORNER_RADIUS if nil
    func roundCorners(radius: CGFloat? = nil) {
        // Ensure thread safety for UI updates
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.roundCorners(radius: radius)
            }
            return
        }
        
        layer.cornerRadius = radius ?? UI.CORNER_RADIUS
        layer.masksToBounds = true
        if #available(iOS 15.0, *) {
            layer.cornerCurve = .continuous
        }
    }
    
    /// Animates the view's fade in with completion handler
    /// - Parameters:
    ///   - duration: Optional animation duration. Uses UI.ANIMATION_DURATION if nil
    ///   - completion: Optional completion handler called when animation finishes
    func fadeIn(duration: TimeInterval? = nil, completion: (() -> Void)? = nil) {
        // Ensure thread safety for UI updates
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.fadeIn(duration: duration, completion: completion)
            }
            return
        }
        
        // Cancel any ongoing animations
        layer.removeAllAnimations()
        
        // Set initial state
        alpha = 0
        
        UIView.animate(
            withDuration: duration ?? UI.ANIMATION_DURATION,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState],
            animations: { [weak self] in
                self?.alpha = 1
            },
            completion: { _ in
                // Ensure completion handler runs on main thread
                DispatchQueue.main.async {
                    completion?()
                }
            }
        )
    }
    
    /// Animates the view's fade out with completion handler
    /// - Parameters:
    ///   - duration: Optional animation duration. Uses UI.ANIMATION_DURATION if nil
    ///   - completion: Optional completion handler called when animation finishes
    func fadeOut(duration: TimeInterval? = nil, completion: (() -> Void)? = nil) {
        // Ensure thread safety for UI updates
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.fadeOut(duration: duration, completion: completion)
            }
            return
        }
        
        // Cancel any ongoing animations
        layer.removeAllAnimations()
        
        UIView.animate(
            withDuration: duration ?? UI.ANIMATION_DURATION,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState],
            animations: { [weak self] in
                self?.alpha = 0
            },
            completion: { _ in
                // Ensure completion handler runs on main thread
                DispatchQueue.main.async {
                    completion?()
                }
            }
        )
    }
    
    /// Constrains view to fill its superview with proper null checks
    func fillSuperview() {
        guard let superview = superview else {
            assertionFailure("Cannot fill superview - superview is nil")
            return
        }
        
        // Disable autoresizing mask to use constraints
        translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: superview.topAnchor),
            leadingAnchor.constraint(equalTo: superview.leadingAnchor),
            trailingAnchor.constraint(equalTo: superview.trailingAnchor),
            bottomAnchor.constraint(equalTo: superview.bottomAnchor)
        ])
        
        // Trigger layout update if needed
        superview.layoutIfNeeded()
    }
    
    /// Centers view in its superview with proper null checks
    func centerInSuperview() {
        guard let superview = superview else {
            assertionFailure("Cannot center in superview - superview is nil")
            return
        }
        
        // Disable autoresizing mask to use constraints
        translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            centerXAnchor.constraint(equalTo: superview.centerXAnchor),
            centerYAnchor.constraint(equalTo: superview.centerYAnchor)
        ])
        
        // Trigger layout update if needed
        superview.layoutIfNeeded()
    }
}