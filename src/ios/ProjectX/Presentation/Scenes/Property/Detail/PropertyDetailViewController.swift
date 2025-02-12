//
// PropertyDetailViewController.swift
// ProjectX
//
// Enhanced view controller for displaying detailed property information with performance optimization,
// accessibility support, and monitoring capabilities.
// UIKit version: iOS 15.0+
// SDWebImage version: 5.15.0
// DatadogCore version: 2.0.0
//

import UIKit
import Combine
import SDWebImage
import DatadogCore

@MainActor
final class PropertyDetailViewController: UIViewController, Storyboarded {
    
    // MARK: - Properties
    
    private let viewModel: PropertyDetailViewModel
    private var cancellables = Set<AnyCancellable>()
    
    // UI Components
    private lazy var imageCarousel: ImageCarousel = {
        let carousel = ImageCarousel(
            frame: .zero,
            autoScrollInterval: 5.0,
            imageAspectRatio: 16/9,
            imageCacheSize: Storage.IMAGE_CACHE_SIZE_MB
        )
        return carousel
    }()
    
    private lazy var mainStackView: UIStackView = {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 16
        stack.layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        stack.isLayoutMarginsRelativeArrangement = true
        return stack
    }()
    
    private lazy var titleLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .title1)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        return label
    }()
    
    private lazy var priceLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = .systemBlue
        return label
    }()
    
    private lazy var descriptionLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        return label
    }()
    
    private lazy var amenitiesCollectionView: UICollectionView = {
        let layout = UICollectionViewFlowLayout()
        layout.scrollDirection = .horizontal
        layout.minimumInteritemSpacing = 8
        let collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.backgroundColor = .clear
        collection.register(AmenityCell.self, forCellWithReuseIdentifier: "AmenityCell")
        collection.delegate = self
        collection.dataSource = self
        return collection
    }()
    
    private lazy var favoriteButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "heart"), for: .normal)
        button.addTarget(self, action: #selector(favoriteButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var applyButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("Apply Now", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = UI.CORNER_RADIUS
        button.addTarget(self, action: #selector(applyButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.hidesWhenStopped = true
        return indicator
    }()
    
    // Monitoring
    private let performanceMonitor = DatadogCore.Monitor()
    private let errorHandler = ErrorHandler()
    private let analytics = Analytics.shared
    
    // MARK: - Initialization
    
    init(viewModel: PropertyDetailViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle Methods
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        let startTime = CFAbsoluteTimeGetCurrent()
        performanceMonitor.startMeasuring("viewDidLoad")
        
        setupUI()
        bindViewModel()
        setupAccessibility()
        
        // Track view load performance
        let loadTime = CFAbsoluteTimeGetCurrent() - startTime
        performanceMonitor.stopMeasuring("viewDidLoad", metrics: ["duration": loadTime])
        analytics.trackScreen("PropertyDetail", properties: ["loadTime": loadTime])
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        imageCarousel.startAutoScroll()
    }
    
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        imageCarousel.stopAutoScroll()
    }
    
    // MARK: - Setup Methods
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        // Configure image carousel
        view.addSubview(imageCarousel)
        imageCarousel.translatesAutoresizingMaskIntoConstraints = false
        
        // Configure main stack view
        view.addSubview(mainStackView)
        mainStackView.translatesAutoresizingMaskIntoConstraints = false
        
        // Add components to stack
        mainStackView.addArrangedSubview(titleLabel)
        mainStackView.addArrangedSubview(priceLabel)
        mainStackView.addArrangedSubview(descriptionLabel)
        mainStackView.addArrangedSubview(amenitiesCollectionView)
        mainStackView.addArrangedSubview(applyButton)
        
        // Add loading indicator
        view.addSubview(loadingIndicator)
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false
        
        // Configure navigation bar
        navigationItem.rightBarButtonItem = UIBarButtonItem(customView: favoriteButton)
        
        NSLayoutConstraint.activate([
            imageCarousel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            imageCarousel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            imageCarousel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            imageCarousel.heightAnchor.constraint(equalTo: imageCarousel.widthAnchor, multiplier: 9/16),
            
            mainStackView.topAnchor.constraint(equalTo: imageCarousel.bottomAnchor),
            mainStackView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mainStackView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            mainStackView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            
            amenitiesCollectionView.heightAnchor.constraint(equalToConstant: 44),
            
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
    
    private func bindViewModel() {
        let input = PropertyDetailViewModel.Input(
            viewDidLoad: PassthroughSubject<String, Never>(),
            refresh: PassthroughSubject<Void, Never>(),
            toggleFavorite: PassthroughSubject<Void, Never>(),
            selectImage: PassthroughSubject<Int, Never>(),
            selectAmenity: PassthroughSubject<String, Never>(),
            retry: PassthroughSubject<Void, Never>()
        )
        
        let output = viewModel.transform(input)
        
        // Bind loading state
        output.isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                isLoading ? self?.loadingIndicator.startAnimating() : self?.loadingIndicator.stopAnimating()
                self?.analytics.trackEvent("PropertyDetailLoading", properties: ["state": isLoading])
            }
            .store(in: &cancellables)
        
        // Bind property data
        output.property
            .receive(on: DispatchQueue.main)
            .sink { [weak self] property in
                self?.updateUI(with: property)
            }
            .store(in: &cancellables)
        
        // Bind selected image
        output.selectedImage
            .receive(on: DispatchQueue.main)
            .sink { [weak self] image in
                self?.imageCarousel.setImages([image].compactMap { $0?.absoluteString })
            }
            .store(in: &cancellables)
        
        // Bind error state
        output.error
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                if let error = error {
                    self?.errorHandler.handle(error)
                }
            }
            .store(in: &cancellables)
    }
    
    private func setupAccessibility() {
        imageCarousel.configureAccessibility(enabled: true, labels: [])
        
        titleLabel.isAccessibilityElement = true
        titleLabel.accessibilityTraits = .header
        
        priceLabel.isAccessibilityElement = true
        priceLabel.accessibilityLabel = "Monthly Rent"
        
        applyButton.isAccessibilityElement = true
        applyButton.accessibilityTraits = .button
        applyButton.accessibilityLabel = "Apply for this property"
        
        favoriteButton.isAccessibilityElement = true
        favoriteButton.accessibilityLabel = "Add to favorites"
    }
    
    // MARK: - UI Update Methods
    
    private func updateUI(with property: Property?) {
        guard let property = property else { return }
        
        let startTime = CFAbsoluteTimeGetCurrent()
        performanceMonitor.startMeasuring("updateUI")
        
        // Update image carousel
        imageCarousel.setImages(property.images)
        
        // Update text content
        titleLabel.text = property.name
        priceLabel.text = String(format: "$%.2f/month", property.price)
        descriptionLabel.text = property.propertyDescription
        
        // Update favorite button state
        favoriteButton.setImage(
            UIImage(systemName: "heart.fill"),
            for: .normal
        )
        
        // Update amenities collection
        amenitiesCollectionView.reloadData()
        
        // Update accessibility labels
        updateAccessibilityLabels(for: property)
        
        let updateTime = CFAbsoluteTimeGetCurrent() - startTime
        performanceMonitor.stopMeasuring("updateUI", metrics: ["duration": updateTime])
    }
    
    private func updateAccessibilityLabels(for property: Property) {
        titleLabel.accessibilityLabel = "Property Name: \(property.name)"
        priceLabel.accessibilityLabel = "Monthly Rent: $\(property.price)"
        descriptionLabel.accessibilityLabel = "Property Description: \(property.propertyDescription)"
    }
    
    // MARK: - Action Methods
    
    @objc private func favoriteButtonTapped() {
        analytics.trackEvent("PropertyDetailFavorite")
        // Handle favorite action
    }
    
    @objc private func applyButtonTapped() {
        analytics.trackEvent("PropertyDetailApply")
        // Handle apply action
    }
    
    // MARK: - Memory Management
    
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        imageCarousel.stopAutoScroll()
        SDImageCache.shared.clearMemory()
    }
}

// MARK: - UICollectionViewDataSource

extension PropertyDetailViewController: UICollectionViewDataSource {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        return viewModel.property?.amenities.count ?? 0
    }
    
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "AmenityCell", for: indexPath) as? AmenityCell else {
            return UICollectionViewCell()
        }
        
        if let amenity = viewModel.property?.amenities[indexPath.item] {
            cell.configure(with: amenity)
        }
        
        return cell
    }
}

// MARK: - UICollectionViewDelegateFlowLayout

extension PropertyDetailViewController: UICollectionViewDelegateFlowLayout {
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        return CGSize(width: 120, height: 40)
    }
}

// MARK: - AmenityCell

private final class AmenityCell: UICollectionViewCell {
    private let label: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.textAlignment = .center
        return label
    }()
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupUI() {
        backgroundColor = .systemGray6
        layer.cornerRadius = UI.CORNER_RADIUS
        
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor)
        ])
    }
    
    func configure(with amenity: String) {
        label.text = amenity
    }
}