import UIKit
import Combine  // iOS 15.0+

/// View controller implementing the dashboard screen UI and user interactions with comprehensive accessibility support
final class DashboardViewController: UIViewController, Storyboarded {
    
    // MARK: - Properties
    
    private let viewModel: DashboardViewModel
    private var cancellables = Set<AnyCancellable>()
    private let analyticsTracker: AnalyticsTracker
    private let imagePrefetcher = SDWebImagePrefetcher.shared
    
    // MARK: - UI Components
    
    private lazy var statsStackView: UIStackView = {
        let stackView = UIStackView()
        stackView.axis = .horizontal
        stackView.distribution = .fillEqually
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.isAccessibilityElement = false
        stackView.accessibilityElements = []
        return stackView
    }()
    
    private lazy var propertyCollectionView: UICollectionView = {
        let layout = createCollectionViewLayout()
        let collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.backgroundColor = .systemBackground
        collectionView.register(PropertyCell.self, forCellWithReuseIdentifier: "PropertyCell")
        collectionView.prefetchDataSource = self
        collectionView.delegate = self
        collectionView.accessibilityLabel = "Properties"
        return collectionView
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .large)
        indicator.hidesWhenStopped = true
        indicator.translatesAutoresizingMaskIntoConstraints = false
        return indicator
    }()
    
    private lazy var refreshControl: UIRefreshControl = {
        let control = UIRefreshControl()
        control.addTarget(self, action: #selector(handleRefresh), for: .valueChanged)
        return control
    }()
    
    private lazy var dataSource: UICollectionViewDiffableDataSource<String, Property> = {
        return createDataSource()
    }()
    
    // MARK: - Initialization
    
    init(viewModel: DashboardViewModel, analyticsTracker: AnalyticsTracker) {
        self.viewModel = viewModel
        self.analyticsTracker = analyticsTracker
        super.init(nibName: nil, bundle: nil)
        self.accessibilityIdentifier = "DashboardViewController"
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
        configureAccessibility()
        
        analyticsTracker.trackScreen(name: "Dashboard")
        
        // Send initial load event
        viewModel.input.viewDidLoad.send(())
    }
    
    // MARK: - UI Setup
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        title = "Dashboard"
        
        view.addSubview(statsStackView)
        view.addSubview(propertyCollectionView)
        view.addSubview(loadingIndicator)
        propertyCollectionView.refreshControl = refreshControl
        
        NSLayoutConstraint.activate([
            statsStackView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            statsStackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            statsStackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            
            propertyCollectionView.topAnchor.constraint(equalTo: statsStackView.bottomAnchor, constant: 16),
            propertyCollectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            propertyCollectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            propertyCollectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
    
    private func createCollectionViewLayout() -> UICollectionViewLayout {
        let itemSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1.0),
            heightDimension: .estimated(300)
        )
        let item = NSCollectionLayoutItem(layoutSize: itemSize)
        
        let groupSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1.0),
            heightDimension: .estimated(300)
        )
        let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, subitems: [item])
        
        let section = NSCollectionLayoutSection(group: group)
        section.interGroupSpacing = 16
        section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 16, bottom: 16, trailing: 16)
        
        return UICollectionViewCompositionalLayout(section: section)
    }
    
    private func createDataSource() -> UICollectionViewDiffableDataSource<String, Property> {
        return UICollectionViewDiffableDataSource(
            collectionView: propertyCollectionView
        ) { [weak self] collectionView, indexPath, property in
            guard let cell = collectionView.dequeueReusableCell(
                withReuseIdentifier: "PropertyCell",
                for: indexPath
            ) as? PropertyCell else {
                return UICollectionViewCell()
            }
            
            cell.configure(with: property)
            return cell
        }
    }
    
    private func configureAccessibility() {
        statsStackView.accessibilityLabel = "Property Statistics"
        statsStackView.accessibilityHint = "Shows key statistics about your properties"
        
        propertyCollectionView.accessibilityLabel = "Property List"
        propertyCollectionView.accessibilityHint = "List of your properties"
        
        refreshControl.accessibilityLabel = "Refresh Properties"
        refreshControl.accessibilityHint = "Pull down to refresh property data"
    }
    
    // MARK: - View Model Binding
    
    private func bindViewModel() {
        // Bind properties to collection view
        viewModel.output.properties
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.handleError(error)
                }
            } receiveValue: { [weak self] properties in
                self?.updateDataSource(with: properties)
                self?.prefetchImages(for: properties)
            }
            .store(in: &cancellables)
        
        // Bind statistics
        viewModel.output.statistics
            .receive(on: DispatchQueue.main)
            .sink { [weak self] stats in
                self?.updateStatistics(stats)
            }
            .store(in: &cancellables)
        
        // Bind loading state
        viewModel.output.isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                self?.updateLoadingState(isLoading)
            }
            .store(in: &cancellables)
        
        // Bind error state
        viewModel.output.error
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                if let error = error {
                    self?.handleError(error)
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Data Updates
    
    private func updateDataSource(with properties: [Property]) {
        var snapshot = NSDiffableDataSourceSnapshot<String, Property>()
        snapshot.appendSections(["Properties"])
        snapshot.appendItems(properties)
        dataSource.apply(snapshot, animatingDifferences: true)
    }
    
    private func updateStatistics(_ stats: DashboardViewModel.DashboardStats) {
        statsStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }
        
        let stats = [
            ("Properties", "\(stats.totalProperties)"),
            ("Active", "\(stats.activeListings)"),
            ("Applications", "\(stats.pendingApplications)")
        ]
        
        stats.forEach { title, value in
            let statView = createStatView(title: title, value: value)
            statsStackView.addArrangedSubview(statView)
        }
    }
    
    private func createStatView(title: String, value: String) -> UIView {
        let container = UIView()
        container.backgroundColor = .secondarySystemBackground
        container.layer.cornerRadius = UI.CORNER_RADIUS
        
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.alignment = .center
        stackView.spacing = 4
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        let valueLabel = UILabel()
        valueLabel.font = .preferredFont(forTextStyle: .title2)
        valueLabel.text = value
        valueLabel.adjustsFontForContentSizeCategory = true
        
        let titleLabel = UILabel()
        titleLabel.font = .preferredFont(forTextStyle: .caption1)
        titleLabel.text = title
        titleLabel.textColor = .secondaryLabel
        titleLabel.adjustsFontForContentSizeCategory = true
        
        stackView.addArrangedSubview(valueLabel)
        stackView.addArrangedSubview(titleLabel)
        container.addSubview(stackView)
        
        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: container.topAnchor, constant: 12),
            stackView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
            stackView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
            stackView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -12)
        ])
        
        container.isAccessibilityElement = true
        container.accessibilityLabel = "\(title): \(value)"
        
        return container
    }
    
    private func updateLoadingState(_ isLoading: Bool) {
        if isLoading {
            loadingIndicator.startAnimating()
            UIAccessibility.post(notification: .announcement, argument: "Loading properties")
        } else {
            loadingIndicator.stopAnimating()
            refreshControl.endRefreshing()
            UIAccessibility.post(notification: .announcement, argument: "Properties loaded")
        }
    }
    
    private func prefetchImages(for properties: [Property]) {
        let urls = properties.compactMap { property in
            property.images.first.flatMap { URL(string: $0) }
        }
        imagePrefetcher.prefetchURLs(urls)
    }
    
    // MARK: - Error Handling
    
    private func handleError(_ error: Error) {
        analyticsTracker.trackError(error)
        
        let alert = UIAlertController(
            title: "Error",
            message: error.localizedDescription,
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
            self?.viewModel.input.refresh.send(())
        })
        
        alert.addAction(UIAlertAction(title: "OK", style: .cancel))
        
        present(alert, animated: true)
    }
    
    // MARK: - Actions
    
    @objc private func handleRefresh() {
        analyticsTracker.trackEvent(name: "dashboard_refresh")
        viewModel.input.refresh.send(())
    }
}

// MARK: - UICollectionViewDelegate

extension DashboardViewController: UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard let property = dataSource.itemIdentifier(for: indexPath) else { return }
        
        analyticsTracker.trackEvent(
            name: "property_selected",
            properties: ["property_id": property.id]
        )
        
        viewModel.input.propertySelected.send(property.id)
    }
}

// MARK: - UICollectionViewDataSourcePrefetching

extension DashboardViewController: UICollectionViewDataSourcePrefetching {
    func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
        let properties = indexPaths.compactMap { dataSource.itemIdentifier(for: $0) }
        prefetchImages(for: properties)
    }
    
    func collectionView(_ collectionView: UICollectionView, cancelPrefetchingForItemsAt indexPaths: [IndexPath]) {
        let urls = indexPaths.compactMap { dataSource.itemIdentifier(for: $0) }
            .compactMap { $0.images.first }
            .compactMap { URL(string: $0) }
        
        imagePrefetcher.cancelPrefetching(with: urls)
    }
}