//
// ImageCarousel.swift
// ProjectX
//
// A reusable UICollectionView-based image carousel component with accessibility support
// UIKit version: iOS 15.0+
// SDWebImage version: 5.15.0
//

import UIKit
import SDWebImage

@IBDesignable
public class ImageCarousel: UIView {
    
    // MARK: - Private Properties
    
    private lazy var collectionView: UICollectionView = {
        let layout = UICollectionViewFlowLayout()
        layout.scrollDirection = .horizontal
        layout.minimumInteritemSpacing = 0
        layout.minimumLineSpacing = 0
        
        let collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.backgroundColor = .clear
        collection.isPagingEnabled = true
        collection.showsHorizontalScrollIndicator = false
        collection.delegate = self
        collection.dataSource = self
        collection.prefetchDataSource = self
        collection.decelerationRate = .fast
        collection.register(ImageCarouselCell.self, forCellWithReuseIdentifier: "ImageCarouselCell")
        return collection
    }()
    
    private lazy var pageControl: UIPageControl = {
        let control = UIPageControl()
        control.hidesForSinglePage = true
        control.currentPageIndicatorTintColor = .systemBlue
        control.pageIndicatorTintColor = .systemGray3
        control.addTarget(self, action: #selector(pageControlValueChanged(_:)), for: .valueChanged)
        return control
    }()
    
    private var autoScrollTimer: Timer?
    private var imageUrls: [String] = []
    private let autoScrollInterval: TimeInterval
    private var isAutoScrollEnabled: Bool = false
    private var isAccessibilityActive: Bool = false
    private let imageLoadingOptions: SDWebImageOptions = [
        .progressiveLoad,
        .retryFailed,
        .scaleDownLargeImages,
        .handleCookies
    ]
    private let placeholderImage = UIImage(named: "property_placeholder")
    private let imageAspectRatio: CGFloat
    private let imageCacheSize: Int
    
    // MARK: - Initialization
    
    public init(frame: CGRect,
                autoScrollInterval: TimeInterval? = 5.0,
                imageAspectRatio: CGFloat = 16/9,
                imageCacheSize: Int = Storage.IMAGE_CACHE_SIZE_MB) {
        self.autoScrollInterval = autoScrollInterval ?? 5.0
        self.imageAspectRatio = imageAspectRatio
        self.imageCacheSize = imageCacheSize
        super.init(frame: frame)
        setupViews()
        setupImageLoading()
        setupAccessibility()
        setupNotifications()
    }
    
    required init?(coder: NSCoder) {
        self.autoScrollInterval = 5.0
        self.imageAspectRatio = 16/9
        self.imageCacheSize = Storage.IMAGE_CACHE_SIZE_MB
        super.init(coder: coder)
        setupViews()
        setupImageLoading()
        setupAccessibility()
        setupNotifications()
    }
    
    // MARK: - Public Methods
    
    public func setImages(_ urls: [String]) {
        imageUrls = urls
        pageControl.numberOfPages = urls.count
        collectionView.reloadData()
        updateAccessibilityLabels()
    }
    
    public func startAutoScroll() {
        guard autoScrollTimer == nil, imageUrls.count > 1 else { return }
        isAutoScrollEnabled = true
        setupAutoScroll()
    }
    
    public func stopAutoScroll() {
        isAutoScrollEnabled = false
        autoScrollTimer?.invalidate()
        autoScrollTimer = nil
    }
    
    public func configureAccessibility(enabled: Bool, labels: [String]) {
        isAccessibilityActive = enabled
        if enabled {
            isAccessibilityElement = true
            accessibilityLabel = "Property Image Gallery"
            accessibilityHint = "Swipe left or right to view property images"
            updateAccessibilityLabels()
        } else {
            isAccessibilityElement = false
        }
    }
    
    // MARK: - Private Methods
    
    private func setupViews() {
        // Add and configure collection view
        addSubview(collectionView)
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.roundCorners(radius: UI.CORNER_RADIUS)
        collectionView.fillSuperview()
        
        // Add and configure page control
        addSubview(pageControl)
        pageControl.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            pageControl.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            pageControl.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            pageControl.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            pageControl.heightAnchor.constraint(equalToConstant: 20)
        ])
    }
    
    private func setupImageLoading() {
        // Configure SDWebImage cache
        SDImageCache.shared.config.maxMemoryCost = imageCacheSize * 1024 * 1024
        SDWebImageDownloader.shared.config.downloadTimeout = API.TIMEOUT
        SDWebImageDownloader.shared.config.maxConcurrentDownloads = 3
    }
    
    private func setupAccessibility() {
        collectionView.accessibilityIdentifier = "PropertyImageCarousel"
        pageControl.accessibilityIdentifier = "ImageCarouselPageControl"
    }
    
    private func setupAutoScroll() {
        guard isAutoScrollEnabled else { return }
        autoScrollTimer = Timer.scheduledTimer(withTimeInterval: autoScrollInterval, repeats: true) { [weak self] _ in
            self?.scrollToNextImage()
        }
    }
    
    private func scrollToNextImage() {
        guard imageUrls.count > 1 else { return }
        let currentPage = pageControl.currentPage
        let nextPage = currentPage + 1 >= imageUrls.count ? 0 : currentPage + 1
        let indexPath = IndexPath(item: nextPage, section: 0)
        collectionView.scrollToItem(at: indexPath, at: .centeredHorizontally, animated: true)
        pageControl.currentPage = nextPage
        updateAccessibilityLabels()
    }
    
    private func updateAccessibilityLabels() {
        guard isAccessibilityActive else { return }
        let currentPage = pageControl.currentPage + 1
        let totalPages = imageUrls.count
        accessibilityValue = "Image \(currentPage) of \(totalPages)"
    }
    
    private func setupNotifications() {
        NotificationCenter.default.addObserver(self,
                                             selector: #selector(handleMemoryWarning),
                                             name: UIApplication.didReceiveMemoryWarningNotification,
                                             object: nil)
    }
    
    @objc private func handleMemoryWarning() {
        SDImageCache.shared.clearMemory()
    }
    
    @objc private func pageControlValueChanged(_ sender: UIPageControl) {
        let indexPath = IndexPath(item: sender.currentPage, section: 0)
        collectionView.scrollToItem(at: indexPath, at: .centeredHorizontally, animated: true)
        updateAccessibilityLabels()
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        stopAutoScroll()
    }
}

// MARK: - UICollectionViewDataSource

extension ImageCarousel: UICollectionViewDataSource {
    public func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        return imageUrls.count
    }
    
    public func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "ImageCarouselCell", for: indexPath) as? ImageCarouselCell else {
            return UICollectionViewCell()
        }
        
        let imageUrl = imageUrls[indexPath.item]
        cell.configure(with: imageUrl, options: imageLoadingOptions, placeholder: placeholderImage)
        return cell
    }
}

// MARK: - UICollectionViewDelegateFlowLayout

extension ImageCarousel: UICollectionViewDelegateFlowLayout {
    public func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let width = collectionView.bounds.width
        let height = width / imageAspectRatio
        return CGSize(width: width, height: height)
    }
    
    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let page = Int(scrollView.contentOffset.x / scrollView.bounds.width)
        pageControl.currentPage = page
        updateAccessibilityLabels()
    }
    
    public func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        stopAutoScroll()
    }
    
    public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if isAutoScrollEnabled {
            setupAutoScroll()
        }
    }
}

// MARK: - UICollectionViewDataSourcePrefetching

extension ImageCarousel: UICollectionViewDataSourcePrefetching {
    public func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
        let urls = indexPaths.compactMap { URL(string: imageUrls[$0.item]) }
        SDWebImagePrefetcher.shared.prefetchURLs(urls)
    }
    
    public func collectionView(_ collectionView: UICollectionView, cancelPrefetchingForItemsAt indexPaths: [IndexPath]) {
        let urls = indexPaths.compactMap { URL(string: imageUrls[$0.item]) }
        SDWebImagePrefetcher.shared.cancelPrefetching(urls: urls)
    }
}

// MARK: - ImageCarouselCell

private class ImageCarouselCell: UICollectionViewCell {
    private let imageView: UIImageView = {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        return view
    }()
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupViews()
    }
    
    private func setupViews() {
        contentView.addSubview(imageView)
        imageView.fillSuperview()
    }
    
    func configure(with imageUrl: String, options: SDWebImageOptions, placeholder: UIImage?) {
        guard let url = URL(string: imageUrl) else { return }
        imageView.sd_setImage(
            with: url,
            placeholderImage: placeholder,
            options: options,
            progress: nil,
            completed: { [weak self] (image, error, cacheType, url) in
                if let error = error {
                    print("Error loading image: \(error.localizedDescription)")
                }
                // Apply fade animation if image was not cached
                if cacheType == .none {
                    self?.imageView.alpha = 0
                    UIView.animate(withDuration: UI.ANIMATION_DURATION) {
                        self?.imageView.alpha = 1
                    }
                }
            }
        )
    }
    
    override func prepareForReuse() {
        super.prepareForReuse()
        imageView.sd_cancelCurrentImageLoad()
        imageView.image = nil
    }
}