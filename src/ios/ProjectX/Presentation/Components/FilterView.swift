//
// FilterView.swift
// ProjectX
//
// Thread-safe, reactive filter view component for property search and filtering
// iOS SDK 15.0+
//

import UIKit
import Combine

// MARK: - FilterCriteria

/// Thread-safe model representing validated property filter criteria
public struct FilterCriteria {
    public let priceRange: ClosedRange<Double>
    public let bedrooms: Int
    public let bathrooms: Int
    public let isPetFriendly: Bool
    public let id: UUID
    
    public init(priceRange: ClosedRange<Double>, bedrooms: Int, bathrooms: Int, isPetFriendly: Bool) {
        self.priceRange = priceRange
        self.bedrooms = max(0, bedrooms)
        self.bathrooms = max(0, bathrooms)
        self.isPetFriendly = isPetFriendly
        self.id = UUID()
    }
}

// MARK: - FilterView

/// Thread-safe, reactive custom view component for property search filters with accessibility support
public final class FilterView: UIView {
    
    // MARK: - Properties
    
    private let filterLock = NSLock()
    private var cancellables = Set<AnyCancellable>()
    
    public let filterSubject = CurrentValueSubject<FilterCriteria, Never>(
        FilterCriteria(
            priceRange: 500...10000,
            bedrooms: 0,
            bathrooms: 0,
            isPetFriendly: false
        )
    )
    
    // MARK: - UI Components
    
    private lazy var containerStack: UIStackView = {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 16
        stack.distribution = .fill
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()
    
    private lazy var priceRangeLabel: UILabel = {
        let label = UILabel()
        label.text = "Price Range"
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true
        label.accessibilityTraits = .header
        return label
    }()
    
    private lazy var priceSlider: UISlider = {
        let slider = UISlider()
        slider.minimumValue = 500
        slider.maximumValue = 10000
        slider.value = 500
        slider.accessibilityLabel = "Price range slider"
        slider.isAccessibilityElement = true
        return slider
    }()
    
    private lazy var bedroomsControl: UISegmentedControl = {
        let items = ["Any", "1+", "2+", "3+", "4+"]
        let control = UISegmentedControl(items: items)
        control.selectedSegmentIndex = 0
        control.accessibilityLabel = "Number of bedrooms"
        return control
    }()
    
    private lazy var bathroomsControl: UISegmentedControl = {
        let items = ["Any", "1+", "2+", "3+"]
        let control = UISegmentedControl(items: items)
        control.selectedSegmentIndex = 0
        control.accessibilityLabel = "Number of bathrooms"
        return control
    }()
    
    private lazy var petFriendlyStack: UIStackView = {
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.spacing = 8
        stack.distribution = .fill
        return stack
    }()
    
    private lazy var petFriendlyLabel: UILabel = {
        let label = UILabel()
        label.text = "Pet Friendly"
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        return label
    }()
    
    private lazy var petFriendlySwitch: UISwitch = {
        let toggle = UISwitch()
        toggle.accessibilityLabel = "Pet friendly filter"
        return toggle
    }()
    
    // MARK: - Initialization
    
    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
        applyStyle()
        setupBindings()
        setupAccessibility()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        applyStyle()
        setupBindings()
        setupAccessibility()
    }
    
    // MARK: - Setup Methods
    
    private func setupUI() {
        addSubview(containerStack)
        
        // Price Range Section
        let priceStack = UIStackView()
        priceStack.axis = .vertical
        priceStack.spacing = 8
        priceStack.addArrangedSubview(priceRangeLabel)
        priceStack.addArrangedSubview(priceSlider)
        
        // Bedrooms Section
        let bedroomsStack = UIStackView()
        bedroomsStack.axis = .vertical
        bedroomsStack.spacing = 8
        let bedroomsLabel = UILabel()
        bedroomsLabel.text = "Bedrooms"
        bedroomsLabel.font = .preferredFont(forTextStyle: .headline)
        bedroomsLabel.adjustsFontForContentSizeCategory = true
        bedroomsStack.addArrangedSubview(bedroomsLabel)
        bedroomsStack.addArrangedSubview(bedroomsControl)
        
        // Bathrooms Section
        let bathroomsStack = UIStackView()
        bathroomsStack.axis = .vertical
        bathroomsStack.spacing = 8
        let bathroomsLabel = UILabel()
        bathroomsLabel.text = "Bathrooms"
        bathroomsLabel.font = .preferredFont(forTextStyle: .headline)
        bathroomsLabel.adjustsFontForContentSizeCategory = true
        bathroomsStack.addArrangedSubview(bathroomsLabel)
        bathroomsStack.addArrangedSubview(bathroomsControl)
        
        // Pet Friendly Section
        petFriendlyStack.addArrangedSubview(petFriendlyLabel)
        petFriendlyStack.addArrangedSubview(petFriendlySwitch)
        
        // Add all sections to container
        containerStack.addArrangedSubview(priceStack)
        containerStack.addArrangedSubview(bedroomsStack)
        containerStack.addArrangedSubview(bathroomsStack)
        containerStack.addArrangedSubview(petFriendlyStack)
        
        // Layout constraints
        NSLayoutConstraint.activate([
            containerStack.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            containerStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            containerStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            containerStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16)
        ])
    }
    
    private func applyStyle() {
        backgroundColor = .systemBackground
        layer.cornerRadius = UI.CORNER_RADIUS
        addShadow()
        
        // Apply dynamic type styling
        [priceRangeLabel, petFriendlyLabel].forEach { label in
            label.adjustsFontForContentSizeCategory = true
        }
    }
    
    private func setupBindings() {
        // Price slider binding with debounce
        priceSlider.publisher(for: .valueChanged)
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateFilters()
            }
            .store(in: &cancellables)
        
        // Bedrooms control binding
        bedroomsControl.publisher(for: .valueChanged)
            .sink { [weak self] _ in
                self?.updateFilters()
            }
            .store(in: &cancellables)
        
        // Bathrooms control binding
        bathroomsControl.publisher(for: .valueChanged)
            .sink { [weak self] _ in
                self?.updateFilters()
            }
            .store(in: &cancellables)
        
        // Pet friendly switch binding
        petFriendlySwitch.publisher(for: .valueChanged)
            .sink { [weak self] _ in
                self?.updateFilters()
            }
            .store(in: &cancellables)
    }
    
    private func setupAccessibility() {
        isAccessibilityElement = false
        accessibilityElements = [
            priceRangeLabel,
            priceSlider,
            bedroomsControl,
            bathroomsControl,
            petFriendlyStack
        ]
        
        // VoiceOver hints
        priceSlider.accessibilityHint = "Adjust minimum and maximum price range"
        bedroomsControl.accessibilityHint = "Select minimum number of bedrooms"
        bathroomsControl.accessibilityHint = "Select minimum number of bathrooms"
        petFriendlySwitch.accessibilityHint = "Toggle pet friendly properties"
    }
    
    // MARK: - Public Methods
    
    /// Thread-safe method to reset all filters to default values
    public func resetFilters() {
        filterLock.lock()
        defer { filterLock.unlock() }
        
        UIView.animate(withDuration: UI.ANIMATION_DURATION) {
            self.priceSlider.value = self.priceSlider.minimumValue
            self.bedroomsControl.selectedSegmentIndex = 0
            self.bathroomsControl.selectedSegmentIndex = 0
            self.petFriendlySwitch.isOn = false
        }
        
        updateFilters()
    }
    
    // MARK: - Private Methods
    
    private func updateFilters() {
        filterLock.lock()
        defer { filterLock.unlock() }
        
        let priceRange = Double(priceSlider.value)...Double(priceSlider.maximumValue)
        let bedrooms = bedroomsControl.selectedSegmentIndex
        let bathrooms = bathroomsControl.selectedSegmentIndex
        let isPetFriendly = petFriendlySwitch.isOn
        
        let criteria = FilterCriteria(
            priceRange: priceRange,
            bedrooms: bedrooms,
            bathrooms: bathrooms,
            isPetFriendly: isPetFriendly
        )
        
        filterSubject.send(criteria)
        
        // Provide haptic feedback
        let generator = UISelectionFeedbackGenerator()
        generator.selectionChanged()
    }
}