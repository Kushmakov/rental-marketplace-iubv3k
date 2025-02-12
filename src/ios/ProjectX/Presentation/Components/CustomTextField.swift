//
// CustomTextField.swift
// ProjectX
//
// A custom UITextField component implementing Material Design principles with enhanced functionality
// Foundation version: iOS 15.0+
//

import UIKit

@IBDesignable
public class CustomTextField: UITextField {
    
    // MARK: - Public Properties
    
    @IBInspectable public var placeholder: String? {
        didSet {
            updatePlaceholder()
        }
    }
    
    @IBInspectable public var placeholderColor: UIColor = .gray {
        didSet {
            updatePlaceholder()
        }
    }
    
    @IBInspectable public var textColor: UIColor = .black {
        didSet {
            self.textColor = textColor
        }
    }
    
    @IBInspectable public var borderColor: UIColor = .gray {
        didSet {
            layer.borderColor = borderColor.cgColor
        }
    }
    
    @IBInspectable public var borderWidth: CGFloat = 1.0 {
        didSet {
            layer.borderWidth = borderWidth
        }
    }
    
    @IBInspectable public var isSecure: Bool = false {
        didSet {
            isSecureTextEntry = isSecure
            setupSecureTextToggle()
        }
    }
    
    public var keyboardType: UIKeyboardType = .default {
        didSet {
            self.keyboardType = keyboardType
        }
    }
    
    public var isEnabled: Bool = true {
        didSet {
            self.isEnabled = isEnabled
            alpha = isEnabled ? 1.0 : 0.5
        }
    }
    
    public var onTextChange: ((String) -> Void)?
    public var onFocusChange: ((Bool) -> Void)?
    
    // MARK: - Error Handling Properties
    
    public private(set) var hasError: Bool = false
    public private(set) var errorMessage: String?
    
    // MARK: - Private Properties
    
    private var secureTextToggleButton: UIButton?
    private var errorLabel: UILabel?
    private var errorLabelHeightConstraint: NSLayoutConstraint?
    
    private let padding = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
    private let errorLabelHeight: CGFloat = 20
    
    // MARK: - Initialization
    
    override public init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
        setupGestureRecognizers()
        setupTextChangeMonitoring()
        setupAccessibility()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        setupGestureRecognizers()
        setupTextChangeMonitoring()
        setupAccessibility()
    }
    
    // MARK: - UI Setup
    
    private func setupUI() {
        layer.cornerRadius = UI.CORNER_RADIUS
        layer.borderColor = borderColor.cgColor
        layer.borderWidth = borderWidth
        layer.masksToBounds = true
        
        backgroundColor = .white
        textColor = self.textColor
        font = .systemFont(ofSize: 16)
        
        clearButtonMode = .whileEditing
        autocorrectionType = .no
        autocapitalizationType = .none
        
        setupErrorLabel()
        if isSecure {
            setupSecureTextToggle()
        }
    }
    
    private func setupErrorLabel() {
        errorLabel = UILabel()
        guard let errorLabel = errorLabel else { return }
        
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        errorLabel.textColor = UI.ERROR_COLOR
        errorLabel.font = .systemFont(ofSize: 12)
        
        if let superview = superview {
            superview.addSubview(errorLabel)
            
            NSLayoutConstraint.activate([
                errorLabel.topAnchor.constraint(equalTo: bottomAnchor, constant: 4),
                errorLabel.leadingAnchor.constraint(equalTo: leadingAnchor),
                errorLabel.trailingAnchor.constraint(equalTo: trailingAnchor)
            ])
            
            errorLabelHeightConstraint = errorLabel.heightAnchor.constraint(equalToConstant: 0)
            errorLabelHeightConstraint?.isActive = true
        }
    }
    
    private func setupSecureTextToggle() {
        if secureTextToggleButton == nil {
            secureTextToggleButton = UIButton(type: .custom)
            secureTextToggleButton?.setImage(UIImage(systemName: "eye.slash.fill"), for: .normal)
            secureTextToggleButton?.tintColor = .gray
            secureTextToggleButton?.addTarget(self, action: #selector(toggleSecureEntry), for: .touchUpInside)
            
            rightView = secureTextToggleButton
            rightViewMode = .always
        }
    }
    
    // MARK: - Gesture and Event Handling
    
    private func setupGestureRecognizers() {
        addTarget(self, action: #selector(textFieldDidBeginEditing), for: .editingDidBegin)
        addTarget(self, action: #selector(textFieldDidEndEditing), for: .editingDidEnd)
    }
    
    private func setupTextChangeMonitoring() {
        addTarget(self, action: #selector(textDidChange), for: .editingChanged)
    }
    
    // MARK: - Accessibility
    
    private func setupAccessibility() {
        isAccessibilityElement = true
        accessibilityTraits = .textField
        accessibilityLabel = placeholder
        accessibilityHint = isSecure ? "Secure text field. Double tap to edit." : "Text field. Double tap to edit."
    }
    
    // MARK: - Public Methods
    
    public func setError(_ message: String?) {
        hasError = true
        errorMessage = message
        
        UIView.animate(withDuration: UI.ANIMATION_DURATION) {
            self.layer.borderColor = UI.ERROR_COLOR.cgColor
            self.layer.borderWidth = self.borderWidth * 1.5
            
            self.errorLabel?.text = message
            self.errorLabelHeightConstraint?.constant = message != nil ? self.errorLabelHeight : 0
            self.superview?.layoutIfNeeded()
        }
        
        accessibilityLabel = "\(placeholder ?? ""). Error: \(message ?? "")"
    }
    
    public func clearError() {
        hasError = false
        errorMessage = nil
        
        UIView.animate(withDuration: UI.ANIMATION_DURATION) {
            self.layer.borderColor = self.borderColor.cgColor
            self.layer.borderWidth = self.borderWidth
            
            self.errorLabelHeightConstraint?.constant = 0
            self.superview?.layoutIfNeeded()
        }
        
        accessibilityLabel = placeholder
    }
    
    // MARK: - Private Methods
    
    @objc private func toggleSecureEntry() {
        let currentPosition = selectedTextRange
        isSecureTextEntry.toggle()
        
        if let image = isSecureTextEntry ? 
            UIImage(systemName: "eye.slash.fill") : 
            UIImage(systemName: "eye.fill") {
            secureTextToggleButton?.setImage(image, for: .normal)
        }
        
        selectedTextRange = currentPosition
        
        accessibilityLabel = "\(placeholder ?? ""). Password \(isSecureTextEntry ? "hidden" : "shown")"
    }
    
    @objc private func textFieldDidBeginEditing() {
        onFocusChange?(true)
    }
    
    @objc private func textFieldDidEndEditing() {
        onFocusChange?(false)
    }
    
    @objc private func textDidChange() {
        onTextChange?(text ?? "")
    }
    
    private func updatePlaceholder() {
        attributedPlaceholder = NSAttributedString(
            string: placeholder ?? "",
            attributes: [.foregroundColor: placeholderColor]
        )
    }
    
    // MARK: - Layout
    
    override public func textRect(forBounds bounds: CGRect) -> CGRect {
        return bounds.inset(by: padding)
    }
    
    override public func editingRect(forBounds bounds: CGRect) -> CGRect {
        return bounds.inset(by: padding)
    }
    
    override public func placeholderRect(forBounds bounds: CGRect) -> CGRect {
        return bounds.inset(by: padding)
    }
    
    override public func rightViewRect(forBounds bounds: CGRect) -> CGRect {
        return CGRect(x: bounds.width - 40, y: 0, width: 40, height: bounds.height)
    }
}