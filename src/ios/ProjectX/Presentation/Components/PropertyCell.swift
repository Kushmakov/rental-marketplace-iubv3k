//
// PropertyCell.swift
// ProjectX
//
// A reusable UICollectionViewCell for displaying property information with accessibility support
// UIKit version: iOS 15.0+
//

import UIKit
import SDWebImage // v5.15.0

/// A thread-safe UICollectionViewCell subclass that displays property information in a card format
public class PropertyCell: UICollectionViewCell {
    
    // MARK: - UI Components
    
    private lazy var containerView: UIView = {
        let view = UIView()
        view.backgroundColor = .systemBackground
        view.translatesAutoresizingMaskIntoConstraints = false
        view.addShadow()
        view.roundCorners()
        return view
    }()
    
    private lazy var imageView: UIImageView = {
        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.backgroundColor = .systemGray6
        imageView.roundCorners(radius: UI.CORNER_RADIUS)
        imageView.isAccessibilityElement = true
        return imageView
    }()
    
    private lazy var nameLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private lazy var priceLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .title2)
        label.adjustsFontForContentSizeCategory = true
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private lazy var detailsLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.textColor = .secondaryLabel
        label.adjustsFontForContentSizeCategory = true
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.hidesWhenStopped = true
        indicator.translatesAutoresizingMaskIntoConstraints = false
        return indicator
    }()
    
    // MARK: - Properties
    
    private var currentImageOperation: SDWebImageCombinedOperation?
    private var property: Property?
    
    // MARK: - Initialization
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
        configureAccessibility()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        configureAccessibility()
    }
    
    // MARK: - UI Setup
    
    private func setupUI() {
        contentView.addSubview(containerView)
        containerView.addSubview(imageView)
        containerView.addSubview(nameLabel)
        containerView.addSubview(priceLabel)
        containerView.addSubview(detailsLabel)
        containerView.addSubview(loadingIndicator)
        
        NSLayoutConstraint.activate([
            // Container view constraints
            containerView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            containerView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 8),
            containerView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -8),
            containerView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),
            
            // Image view constraints
            imageView.topAnchor.constraint(equalTo: containerView.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor),
            imageView.heightAnchor.constraint(equalTo: containerView.heightAnchor, multiplier: 0.6),
            
            // Loading indicator constraints
            loadingIndicator.centerXAnchor.constraint(equalTo: imageView.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: imageView.centerYAnchor),
            
            // Name label constraints
            nameLabel.topAnchor.constraint(equalTo: imageView.bottomAnchor, constant: 8),
            nameLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 12),
            nameLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -12),
            
            // Price label constraints
            priceLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 4),
            priceLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 12),
            priceLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -12),
            
            // Details label constraints
            detailsLabel.topAnchor.constraint(equalTo: priceLabel.bottomAnchor, constant: 4),
            detailsLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 12),
            detailsLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -12),
            detailsLabel.bottomAnchor.constraint(lessThanOrEqualTo: containerView.bottomAnchor, constant: -12)
        ])
    }
    
    private func configureAccessibility() {
        isAccessibilityElement = true
        accessibilityTraits = .button
        
        // Group child elements for better VoiceOver navigation
        containerView.accessibilityElements = [imageView, nameLabel, priceLabel, detailsLabel]
        
        // Support for RTL languages
        semanticContentAttribute = .forceLeftToRight
    }
    
    // MARK: - Configuration
    
    /// Configures the cell with property data
    /// - Parameter property: The property model to display
    public func configure(with property: Property) {
        self.property = property
        
        // Ensure UI updates happen on main thread
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Configure labels
            self.nameLabel.text = property.name
            self.priceLabel.text = self.formatPrice(property.price)
            self.detailsLabel.text = self.formatDetails(bedrooms: property.bedrooms, bathrooms: property.bathrooms)
            
            // Configure accessibility label
            self.accessibilityLabel = "\(property.name), \(self.formatPrice(property.price)), \(self.formatDetails(bedrooms: property.bedrooms, bathrooms: property.bathrooms))"
            
            // Load image
            self.loadPropertyImage(from: property.images.first)
        }
    }
    
    // MARK: - Private Helpers
    
    private func loadPropertyImage(from urlString: String?) {
        guard let urlString = urlString, let url = URL(string: urlString) else {
            imageView.image = UIImage(systemName: "house")
            imageView.accessibilityLabel = "Property placeholder image"
            return
        }
        
        loadingIndicator.startAnimating()
        
        // Cancel any existing image loading operation
        currentImageOperation?.cancel()
        
        // Configure image loading options
        let options: SDWebImageOptions = [
            .retryFailed,
            .handleCookies,
            .transformAnimatedImage,
            .scaleDownLargeImages
        ]
        
        currentImageOperation = imageView.sd_setImage(
            with: url,
            placeholderImage: UIImage(systemName: "house"),
            options: options
        ) { [weak self] image, error, cacheType, url in
            guard let self = self else { return }
            
            self.loadingIndicator.stopAnimating()
            
            if let error = error {
                print("Error loading property image: \(error.localizedDescription)")
                self.imageView.image = UIImage(systemName: "exclamationmark.triangle")
                self.imageView.accessibilityLabel = "Error loading property image"
            } else {
                self.imageView.accessibilityLabel = "Property image"
            }
        }
    }
    
    private func formatPrice(_ price: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale.current
        return formatter.string(from: NSNumber(value: price)) ?? "$\(price)"
    }
    
    private func formatDetails(bedrooms: Int, bathrooms: Int) -> String {
        return "\(bedrooms) bed • \(bathrooms) bath"
    }
    
    // MARK: - Lifecycle
    
    override public func prepareForReuse() {
        super.prepareForReuse()
        
        // Cancel any pending image loading operation
        currentImageOperation?.cancel()
        currentImageOperation = nil
        
        // Reset UI elements
        imageView.image = nil
        nameLabel.text = nil
        priceLabel.text = nil
        detailsLabel.text = nil
        
        // Reset accessibility
        accessibilityLabel = nil
        
        // Clear property reference
        property = nil
        
        // Stop loading indicator
        loadingIndicator.stopAnimating()
    }
    
    override public func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        
        // Update shadow and corner radius for new trait collection
        containerView.addShadow()
        containerView.roundCorners()
        imageView.roundCorners(radius: UI.CORNER_RADIUS)
    }
}