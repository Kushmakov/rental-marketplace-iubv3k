//
// PropertyListViewController.swift
// ProjectX
//
// View controller managing the property listing screen with comprehensive accessibility and state management
// UIKit version: iOS 15.0+
// Combine version: iOS 15.0+
//

import UIKit
import Combine

@MainActor
public final class PropertyListViewController: UIViewController {
    
    // MARK: - Properties
    
    private let viewModel: PropertyListViewModel
    private var cancellables = Set<AnyCancellable>()
    private let imageCache = NSCache<NSString, UIImage>()
    
    // MARK: - UI Components
    
    private lazy var collectionView: UICollectionView = {
        let layout = createCompositionalLayout()
        let collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.backgroundColor = .systemBackground
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.delegate = self
        collectionView.accessibilityLabel = "Property listings"
        collectionView.accessibilityHint = "Displays available rental properties"
        return collectionView
    }()
    
    private lazy var searchController: UISearchController = {
        let controller = UISearchController(searchResultsController: nil)
        controller.searchBar.placeholder = "Search properties"
        controller.searchBar.accessibilityLabel = "Search properties"
        controller.obscuresBackgroundDuringPresentation = false
        controller.searchBar.delegate = self
        return controller
    }()
    
    private lazy var refreshControl: UIRefreshControl = {
        let control = UIRefreshControl()
        control.attributedTitle = NSAttributedString(string: "Pull to refresh")
        control.addTarget(self, action: #selector(handleRefresh), for: .valueChanged)
        return control
    }()
    
    private lazy var loadingIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .large)
        indicator.hidesWhenStopped = true
        indicator.translatesAutoresizingMaskIntoConstraints = false
        return indicator
    }()
    
    private lazy var emptyStateView: UIView = {
        let view = UIView()
        view.isHidden = true
        view.translatesAutoresizingMaskIntoConstraints = false
        
        let label = UILabel()
        label.text = "No properties found"
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .headline)
        label.translatesAutoresizingMaskIntoConstraints = false
        
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        
        return view
    }()
    
    // MARK: - Initialization
    
    public init(viewModel: PropertyListViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupBindings()
        configureAccessibility()
        loadInitialData()
    }
    
    // MARK: - UI Setup
    
    private func setupUI() {
        title = "Properties"
        navigationController?.navigationBar.prefersLargeTitles = true
        navigationItem.searchController = searchController
        navigationItem.hidesSearchBarWhenScrolling = false
        
        view.addSubview(collectionView)
        view.addSubview(loadingIndicator)
        view.addSubview(emptyStateView)
        
        collectionView.refreshControl = refreshControl
        collectionView.register(PropertyCell.self, forCellWithReuseIdentifier: "PropertyCell")
        
        NSLayoutConstraint.activate([
            collectionView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            
            emptyStateView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            emptyStateView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            emptyStateView.widthAnchor.constraint(equalTo: view.widthAnchor),
            emptyStateView.heightAnchor.constraint(equalToConstant: 200)
        ])
    }
    
    private func setupBindings() {
        // Bind properties to collection view
        viewModel.$properties
            .receive(on: DispatchQueue.main)
            .sink { [weak self] properties in
                self?.updateUI(with: properties)
            }
            .store(in: &cancellables)
        
        // Bind loading state
        viewModel.$isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                self?.handleLoadingState(isLoading)
            }
            .store(in: &cancellables)
        
        // Bind error state
        viewModel.$error
            .receive(on: DispatchQueue.main)
            .compactMap { $0 }
            .sink { [weak self] error in
                self?.showError(error)
            }
            .store(in: &cancellables)
        
        // Handle search text changes with debounce
        searchController.searchBar.textDidChangePublisher
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] searchText in
                self?.handleSearchTextChange(searchText)
            }
            .store(in: &cancellables)
    }
    
    private func configureAccessibility() {
        collectionView.accessibilityLabel = "Property listings"
        collectionView.accessibilityHint = "Displays available rental properties"
        
        searchController.searchBar.accessibilityLabel = "Search properties"
        searchController.searchBar.accessibilityHint = "Enter location or property details to search"
        
        refreshControl.accessibilityLabel = "Refresh property listings"
        refreshControl.accessibilityHint = "Pull down to refresh the list of properties"
    }
    
    // MARK: - Data Loading
    
    private func loadInitialData() {
        viewModel.loadProperties()
    }
    
    private func updateUI(with properties: [Property]) {
        var snapshot = NSDiffableDataSourceSnapshot<Int, Property>()
        snapshot.appendSections([0])
        snapshot.appendItems(properties)
        
        dataSource.apply(snapshot, animatingDifferences: true)
        
        emptyStateView.isHidden = !properties.isEmpty
        UIAccessibility.post(notification: .layoutChanged, argument: properties.isEmpty ? emptyStateView : nil)
    }
    
    // MARK: - UI Helpers
    
    private func handleLoadingState(_ isLoading: Bool) {
        if isLoading {
            loadingIndicator.startAnimating()
        } else {
            loadingIndicator.stopAnimating()
            refreshControl.endRefreshing()
        }
        
        view.isUserInteractionEnabled = !isLoading
        UIAccessibility.post(notification: .layoutChanged, argument: isLoading ? loadingIndicator : nil)
    }
    
    private func showError(_ error: String) {
        let alert = UIAlertController(
            title: "Error",
            message: error,
            preferredStyle: .alert
        )
        
        let retryAction = UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
            self?.viewModel.loadProperties()
        }
        
        let cancelAction = UIAlertAction(title: "Cancel", style: .cancel)
        
        alert.addAction(retryAction)
        alert.addAction(cancelAction)
        
        present(alert, animated: true)
    }
    
    @objc private func handleRefresh() {
        viewModel.loadProperties()
    }
    
    private func handleSearchTextChange(_ searchText: String?) {
        let filter = PropertyFilter(
            location: searchText,
            minPrice: nil,
            maxPrice: nil,
            bedrooms: nil,
            petFriendly: nil,
            sortBy: .default
        )
        viewModel.applyFilter(filter)
    }
    
    // MARK: - Collection View Layout
    
    private func createCompositionalLayout() -> UICollectionViewCompositionalLayout {
        let itemSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1.0),
            heightDimension: .fractionalHeight(1.0)
        )
        let item = NSCollectionLayoutItem(layoutSize: itemSize)
        
        let groupSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1.0),
            heightDimension: .absolute(300)
        )
        let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, subitems: [item])
        
        let section = NSCollectionLayoutSection(group: group)
        section.interGroupSpacing = 16
        section.contentInsets = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)
        
        return UICollectionViewCompositionalLayout(section: section)
    }
}

// MARK: - UICollectionViewDelegate

extension PropertyListViewController: UICollectionViewDelegate {
    public func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: true)
        
        guard let property = dataSource.itemIdentifier(for: indexPath) else { return }
        // Handle property selection (navigation to detail screen would be implemented here)
    }
    
    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offsetY = scrollView.contentOffset.y
        let contentHeight = scrollView.contentSize.height
        let screenHeight = scrollView.frame.size.height
        
        if offsetY > contentHeight - screenHeight - 100 {
            viewModel.loadNextPage()
        }
    }
}

// MARK: - UISearchBarDelegate

extension PropertyListViewController: UISearchBarDelegate {
    public func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
        viewModel.loadProperties(resetPagination: true)
    }
}