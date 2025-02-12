//
// RatingView.swift
// ProjectX
//
// A reusable rating view component that displays and handles interactive star ratings
// UIKit version: iOS 15.0+
//

import UIKit

/// Constants for the rating view configuration
private let kMaxRating: Int = 5
private let kStarSize: CGFloat = 24.0

/// A custom UIView that displays an interactive star rating system with accessibility support
@IBDesignable
public class RatingView: UIView {
    
    // MARK: - Public Properties
    
    /// Current rating value (0 to 5)
    @IBInspectable public var rating: CGFloat = 0 {
        didSet {
            updateRating(rating)
        }
    }
    
    /// Flag to enable/disable user interaction
    @IBInspectable public var isEnabled: Bool = true {
        didSet {
            isUserInteractionEnabled = isEnabled
            updateAccessibilityTraits()
        }
    }
    
    /// Callback triggered when rating changes
    public var ratingDidChange: ((CGFloat) -> Void)?
    
    // MARK: - Private Properties
    
    private let starStackView: UIStackView = {
        let stackView = UIStackView()
        stackView.axis = .horizontal
        stackView.spacing = 4
        stackView.distribution = .fillEqually
        stackView.alignment = .center
        return stackView
    }()
    
    private var starImageViews: [UIImageView] = []
    private lazy var feedbackGenerator = UIImpactFeedbackGenerator(style: .light)
    
    // MARK: - Initialization
    
    override public init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }
    
    required public init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }
    
    // MARK: - Setup
    
    private func setupView() {
        addSubview(starStackView)
        starStackView.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            starStackView.topAnchor.constraint(equalTo: topAnchor),
            starStackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            starStackView.trailingAnchor.constraint(equalTo: trailingAnchor),
            starStackView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        
        setupStars()
        setupGestures()
        setupAccessibility()
        
        // Prepare haptic feedback
        feedbackGenerator.prepare()
    }
    
    private func setupStars() {
        // Remove existing stars if any
        starImageViews.forEach { $0.removeFromSuperview() }
        starImageViews.removeAll()
        
        // Create new star views
        for _ in 0..<kMaxRating {
            let imageView = UIImageView()
            imageView.contentMode = .scaleAspectFit
            imageView.tintColor = .textSecondary
            
            // Configure size constraints
            imageView.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                imageView.widthAnchor.constraint(equalToConstant: kStarSize),
                imageView.heightAnchor.constraint(equalToConstant: kStarSize)
            ])
            
            // Apply styling
            imageView.addShadow()
            imageView.roundCorners(radius: 2)
            
            starImageViews.append(imageView)
            starStackView.addArrangedSubview(imageView)
        }
        
        updateRating(rating)
    }
    
    private func setupGestures() {
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        
        addGestureRecognizer(tapGesture)
        addGestureRecognizer(panGesture)
    }
    
    private func setupAccessibility() {
        isAccessibilityElement = true
        accessibilityLabel = NSLocalizedString("Rating", comment: "Rating view accessibility label")
        accessibilityTraits = isEnabled ? [.adjustable] : [.notEnabled]
        updateAccessibilityValue()
    }
    
    // MARK: - Rating Update
    
    private func updateRating(_ newRating: CGFloat) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            let clampedRating = min(max(newRating, 0), CGFloat(kMaxRating))
            
            // Animate star fills
            UIView.animate(withDuration: UI.ANIMATION_DURATION) {
                for (index, imageView) in self.starImageViews.enumerated() {
                    let fillAmount = min(max(clampedRating - CGFloat(index), 0), 1)
                    imageView.image = self.starImage(filled: fillAmount > 0)
                    imageView.tintColor = fillAmount > 0 ? .accent : .textSecondary
                    imageView.alpha = fillAmount > 0 ? 1.0 : 0.6
                }
            }
            
            self.rating = clampedRating
            self.updateAccessibilityValue()
            self.ratingDidChange?(clampedRating)
        }
    }
    
    // MARK: - Gesture Handling
    
    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        guard isEnabled else { return }
        
        let location = gesture.location(in: starStackView)
        let starWidth = starStackView.bounds.width / CGFloat(kMaxRating)
        let newRating = min(ceil(location.x / starWidth), CGFloat(kMaxRating))
        
        feedbackGenerator.impactOccurred()
        updateRating(newRating)
    }
    
    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard isEnabled else { return }
        
        let location = gesture.location(in: starStackView)
        let starWidth = starStackView.bounds.width / CGFloat(kMaxRating)
        let newRating = min(max(location.x / starWidth, 0), CGFloat(kMaxRating))
        
        if gesture.state == .began || gesture.state == .changed {
            feedbackGenerator.impactOccurred()
            updateRating(newRating)
        }
    }
    
    // MARK: - Helper Methods
    
    private func starImage(filled: Bool) -> UIImage? {
        let systemName = filled ? "star.fill" : "star"
        if #available(iOS 15.0, *) {
            return UIImage(systemName: systemName, withConfiguration: UIImage.SymbolConfiguration(paletteColors: [filled ? .accent : .textSecondary]))
        } else {
            return UIImage(systemName: systemName)
        }
    }
    
    private func updateAccessibilityValue() {
        let formatString = NSLocalizedString("%g out of %d stars", comment: "Accessibility rating value")
        accessibilityValue = String(format: formatString, rating, kMaxRating)
    }
    
    private func updateAccessibilityTraits() {
        accessibilityTraits = isEnabled ? [.adjustable] : [.notEnabled]
    }
    
    // MARK: - Accessibility
    
    public override func accessibilityIncrement() {
        guard isEnabled else { return }
        let newRating = min(rating + 1, CGFloat(kMaxRating))
        updateRating(newRating)
    }
    
    public override func accessibilityDecrement() {
        guard isEnabled else { return }
        let newRating = max(rating - 1, 0)
        updateRating(newRating)
    }
}