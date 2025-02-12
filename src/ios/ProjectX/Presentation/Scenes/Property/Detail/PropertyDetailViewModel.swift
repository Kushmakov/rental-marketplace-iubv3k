import Foundation
import Combine

/// Thread-safe view model managing property detail view state and business logic with performance optimization
/// Version: iOS SDK 14.0+, Combine 14.0+
final class PropertyDetailViewModel: ViewModelType {
    
    // MARK: - Types
    
    struct Input {
        /// Triggered when view loads with property ID
        let viewDidLoad: PassthroughSubject<String, Never>
        /// Triggered when user requests refresh
        let refresh: PassthroughSubject<Void, Never>
        /// Triggered when user toggles favorite status
        let toggleFavorite: PassthroughSubject<Void, Never>
        /// Triggered when user selects an image
        let selectImage: PassthroughSubject<Int, Never>
        /// Triggered when user selects an amenity
        let selectAmenity: PassthroughSubject<String, Never>
        /// Triggered when user requests retry after error
        let retry: PassthroughSubject<Void, Never>
    }
    
    struct Output {
        /// Indicates loading state
        let isLoading: AnyPublisher<Bool, Never>
        /// Emits property details
        let property: AnyPublisher<Property?, Never>
        /// Emits selected image index
        let selectedImageIndex: AnyPublisher<Int, Never>
        /// Emits selected amenity
        let selectedAmenity: AnyPublisher<String?, Never>
        /// Emits errors
        let error: AnyPublisher<Error?, Never>
        /// Emits cached images
        let selectedImage: AnyPublisher<UIImage?, Never>
        /// Indicates accessibility state
        let isAccessibilityEnabled: AnyPublisher<Bool, Never>
    }
    
    // MARK: - Properties
    
    private let repository: PropertyRepository
    private var cancellables = Set<AnyCancellable>()
    private let isLoading = CurrentValueSubject<Bool, Never>(false)
    private let error = CurrentValueSubject<Error?, Never>(nil)
    private let imageCache = NSCache<NSString, UIImage>()
    
    // MARK: - Initialization
    
    init(repository: PropertyRepository) {
        self.repository = repository
        
        // Configure image cache
        imageCache.countLimit = 20 // Cache up to 20 images
        imageCache.totalCostLimit = 50 * 1024 * 1024 // 50MB limit
        
        // Register for memory warning notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - ViewModelType
    
    func transform(_ input: Input) -> AnyPublisher<Output, Never> {
        // Property details publisher
        let propertyPublisher = Publishers.Merge(
            input.viewDidLoad,
            input.retry.map { [weak self] _ in
                self?.error.value = nil
                return self?.error.value?.localizedDescription ?? ""
            }
        )
        .flatMap { [weak self] propertyId -> AnyPublisher<Property?, Never> in
            guard let self = self else {
                return Just(nil).eraseToAnyPublisher()
            }
            return self.loadPropertyDetails(propertyId)
                .handleEvents(
                    receiveSubscription: { [weak self] _ in
                        self?.isLoading.send(true)
                    },
                    receiveCompletion: { [weak self] completion in
                        self?.isLoading.send(false)
                        if case .failure(let error) = completion {
                            self?.error.send(error)
                        }
                    }
                )
                .catch { [weak self] error -> AnyPublisher<Property?, Never> in
                    self?.error.send(error)
                    return Just(nil).eraseToAnyPublisher()
                }
                .eraseToAnyPublisher()
        }
        .share()
        
        // Selected image publisher
        let selectedImagePublisher = input.selectImage
            .compactMap { [weak self] index -> UIImage? in
                guard let property = try? propertyPublisher.value(),
                      index < property.images.count else {
                    return nil
                }
                let imageUrl = property.images[index] as NSString
                return self?.imageCache.object(forKey: imageUrl)
            }
            .eraseToAnyPublisher()
        
        // Selected amenity publisher
        let selectedAmenityPublisher = input.selectAmenity
            .map { amenity -> String? in
                return amenity
            }
            .eraseToAnyPublisher()
        
        // Favorite toggle publisher
        input.toggleFavorite
            .sink { [weak self] _ in
                guard let property = try? propertyPublisher.value() else { return }
                self?.repository.updateProperty(property)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { _ in }
                    )
                    .store(in: &self!.cancellables)
            }
            .store(in: &cancellables)
        
        // Accessibility publisher
        let accessibilityPublisher = NotificationCenter.default
            .publisher(for: UIAccessibility.voiceOverStatusDidChangeNotification)
            .map { _ in UIAccessibility.isVoiceOverRunning }
            .prepend(UIAccessibility.isVoiceOverRunning)
            .eraseToAnyPublisher()
        
        return Just(Output(
            isLoading: isLoading.eraseToAnyPublisher(),
            property: propertyPublisher.eraseToAnyPublisher(),
            selectedImageIndex: input.selectImage.eraseToAnyPublisher(),
            selectedAmenity: selectedAmenityPublisher,
            error: error.eraseToAnyPublisher(),
            selectedImage: selectedImagePublisher,
            isAccessibilityEnabled: accessibilityPublisher
        ))
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func loadPropertyDetails(_ propertyId: String) -> AnyPublisher<Property?, Never> {
        return repository.getPropertyDetails(id: propertyId)
            .map { property -> Property? in
                // Pre-cache images
                self.precacheImages(property.images)
                return property
            }
            .eraseToAnyPublisher()
    }
    
    private func precacheImages(_ urls: [String]) {
        urls.forEach { url in
            guard let imageUrl = URL(string: url) else { return }
            URLSession.shared.dataTask(with: imageUrl) { [weak self] data, _, _ in
                guard let data = data,
                      let image = UIImage(data: data) else { return }
                self?.imageCache.setObject(image, forKey: url as NSString)
            }.resume()
        }
    }
    
    @objc private func handleMemoryWarning() {
        imageCache.removeAllObjects()
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        cancellables.removeAll()
    }
}