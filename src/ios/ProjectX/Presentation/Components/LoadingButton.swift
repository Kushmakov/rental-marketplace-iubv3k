//
// LoadingButton.swift
// ProjectX
//
// A custom UIButton subclass that provides loading state functionality
// with accessibility support and Interface Builder integration.
// Foundation version: iOS 15.0+
//

import UIKit

@IBDesignable
public class LoadingButton: UIButton {
    
    // MARK: - Private Properties
    
    private let activityIndicator = UIActivityIndicatorView(style: .medium)
    private var originalText: String?
    private var isLoading = false
    private var spinnerCenterXConstraint: NSLayoutConstraint!
    private var spinnerCenterYConstraint: NSLayoutConstraint!
    
    // MARK: - IBInspectable Properties
    
    @IBInspectable public var cornerRadius: CGFloat {
        get { layer.cornerRadius }
        set { layer.cornerRadius = newValue }
    }
    
    @IBInspectable public var spinnerColor: UIColor {
        get { activityIndicator.color }
        set { activityIndicator.color = newValue }
    }
    
    // MARK: - Initialization
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupButton()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupButton()
    }
    
    // MARK: - Setup
    
    private func setupButton() {
        setupActivityIndicator()
        setupAppearance()
        setupAccessibility()
    }
    
    private func setupActivityIndicator() {
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        addSubview(activityIndicator)
        
        spinnerCenterXConstraint = activityIndicator.centerXAnchor.constraint(equalTo: centerXAnchor)
        spinnerCenterYConstraint = activityIndicator.centerYAnchor.constraint(equalTo: centerYAnchor)
        
        NSLayoutConstraint.activate([
            spinnerCenterXConstraint,
            spinnerCenterYConstraint
        ])
    }
    
    private func setupAppearance() {
        cornerRadius = UI.CORNER_RADIUS
        clipsToBounds = true
        adjustsImageWhenHighlighted = true
        
        // Default spinner color to match title color
        spinnerColor = titleColor(for: .normal) ?? .white
    }
    
    private func setupAccessibility() {
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = titleLabel?.text
    }
    
    // MARK: - Public Methods
    
    public func startLoading() {
        guard !isLoading else { return }
        
        isLoading = true
        isEnabled = false
        originalText = titleLabel?.text
        
        UIView.animate(withDuration: UI.ANIMATION_DURATION) { [weak self] in
            self?.titleLabel?.alpha = 0
            self?.imageView?.alpha = 0
        } completion: { [weak self] _ in
            self?.activityIndicator.startAnimating()
        }
        
        // Update accessibility
        accessibilityLabel = originalText
        accessibilityHint = "Loading"
        UIAccessibility.post(notification: .layoutChanged, argument: self)
    }
    
    public func stopLoading() {
        guard isLoading else { return }
        
        activityIndicator.stopAnimating()
        
        UIView.animate(withDuration: UI.ANIMATION_DURATION) { [weak self] in
            self?.titleLabel?.alpha = 1
            self?.imageView?.alpha = 1
        }
        
        isEnabled = true
        isLoading = false
        
        // Restore accessibility
        accessibilityHint = nil
        UIAccessibility.post(notification: .layoutChanged, argument: self)
    }
    
    // MARK: - Layout
    
    override public func layoutSubviews() {
        super.layoutSubviews()
        
        // Update corner radius mask if needed
        layer.cornerRadius = cornerRadius
        
        // Handle RTL layout
        if effectiveUserInterfaceLayoutDirection == .rightToLeft {
            spinnerCenterXConstraint.constant = -spinnerCenterXConstraint.constant
        }
        
        // Ensure proper dynamic type support
        titleLabel?.adjustsFontForContentSizeCategory = true
    }
    
    // MARK: - State Preservation
    
    override public func encode(with coder: NSCoder) {
        super.encode(with: coder)
        coder.encode(isLoading, forKey: "isLoading")
        coder.encode(originalText, forKey: "originalText")
    }
    
    override public func decode(with coder: NSCoder) {
        super.decode(with: coder)
        isLoading = coder.decodeBool(forKey: "isLoading")
        originalText = coder.decodeObject(forKey: "originalText") as? String
        
        if isLoading {
            startLoading()
        }
    }
    
    // MARK: - Memory Management
    
    deinit {
        activityIndicator.stopAnimating()
    }
}