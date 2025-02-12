import XCTest // iOS 15.0+

class PropertyFlowUITests: XCTestCase {
    
    // MARK: - Properties
    private var app: XCUIApplication!
    private let defaultTimeout: TimeInterval = 10.0
    private let performanceThreshold: TimeInterval = 2.0
    
    // MARK: - Setup & Teardown
    override func setUpWithError() throws {
        // Disable test continuation after failures for better error isolation
        continueAfterFailure(false)
        
        // Initialize and configure the application
        app = XCUIApplication()
        app.launchArguments = ["UI-Testing"]
        app.launchEnvironment = ["TESTING_MODE": "1"]
        
        // Launch the application
        app.launch()
        
        // Verify we're on the property listing screen
        let propertyList = app.collectionViews["propertyListingCollectionView"]
        XCTAssertTrue(propertyList.waitForExistence(timeout: defaultTimeout))
        
        // Start performance metrics collection
        startMeasuring()
    }
    
    override func tearDownWithError() throws {
        // Stop performance metrics collection
        stopMeasuring()
        
        // Log performance data
        XCTContext.runActivity(named: "Performance Metrics") { activity in
            activity.add(XCTAttachment(string: "Response times logged"))
        }
        
        // Clean up test state
        app.terminate()
        app = nil
        
        try super.tearDownWithError()
    }
    
    // MARK: - Test Cases
    func testPropertyListingDisplay() throws {
        // Start performance measurement
        let measure = XCTMeasure()
        
        measure.start()
        
        // Verify property listing collection view
        let propertyList = app.collectionViews["propertyListingCollectionView"]
        XCTAssertTrue(propertyList.exists)
        
        // Validate minimum number of property cells
        let propertyCells = propertyList.cells
        XCTAssertGreaterThan(propertyCells.count, 0, "Property list should not be empty")
        
        // Test scrolling performance
        measure.startMeasuring()
        propertyList.swipeUp(velocity: .fast)
        measure.stopMeasuring()
        
        XCTAssertLessThan(measure.duration, performanceThreshold, 
                         "Scrolling performance exceeds threshold")
        
        // Verify property cell elements
        let firstProperty = propertyCells.element(boundBy: 0)
        XCTAssertTrue(firstProperty.images["propertyImage"].exists)
        XCTAssertTrue(firstProperty.staticTexts["propertyPrice"].exists)
        XCTAssertTrue(firstProperty.staticTexts["propertyDetails"].exists)
        
        // Test image loading performance
        measure.startMeasuring()
        let imageLoadTime = firstProperty.images["propertyImage"].waitForExistence(timeout: performanceThreshold)
        measure.stopMeasuring()
        
        XCTAssertTrue(imageLoadTime, "Image loading exceeds performance threshold")
        
        // Verify accessibility
        XCTAssertTrue(firstProperty.isAccessibilityElement)
        XCTAssertNotNil(firstProperty.accessibilityLabel)
        
        measure.stop()
    }
    
    func testPropertySearch() throws {
        // Measure search interaction performance
        let measure = XCTMeasure()
        
        measure.start()
        
        // Locate and tap search bar
        let searchBar = app.searchFields["propertySearchBar"]
        XCTAssertTrue(searchBar.exists)
        searchBar.tap()
        
        // Test search input
        measure.startMeasuring()
        searchBar.typeText("Downtown Apartment")
        
        // Verify search suggestions appear
        let suggestions = app.tables["searchSuggestionsTable"]
        XCTAssertTrue(suggestions.waitForExistence(timeout: performanceThreshold))
        measure.stopMeasuring()
        
        // Validate search results
        let searchResults = app.collectionViews["propertyListingCollectionView"].cells
        XCTAssertTrue(searchResults.count > 0, "No search results found")
        
        // Test search cancellation
        let cancelButton = app.buttons["cancelSearch"]
        XCTAssertTrue(cancelButton.exists)
        cancelButton.tap()
        
        // Verify search reset
        XCTAssertEqual(searchBar.value as? String, "", "Search bar not cleared")
        
        measure.stop()
    }
    
    func testPropertyFiltering() throws {
        // Initialize performance measurement
        let measure = XCTMeasure()
        
        measure.start()
        
        // Open filter menu
        let filterButton = app.buttons["filterButton"]
        XCTAssertTrue(filterButton.exists)
        filterButton.tap()
        
        // Verify filter menu appears
        let filterMenu = app.otherElements["filterMenu"]
        XCTAssertTrue(filterMenu.waitForExistence(timeout: defaultTimeout))
        
        // Test price filter
        measure.startMeasuring()
        let priceFilter = filterMenu.sliders["priceRangeSlider"]
        XCTAssertTrue(priceFilter.exists)
        priceFilter.adjust(toNormalizedSliderPosition: 0.5)
        
        // Test bedroom filter
        let bedroomFilter = filterMenu.buttons["2+ Bedrooms"]
        XCTAssertTrue(bedroomFilter.exists)
        bedroomFilter.tap()
        
        // Apply filters
        let applyButton = filterMenu.buttons["applyFilters"]
        applyButton.tap()
        measure.stopMeasuring()
        
        // Verify filter application performance
        XCTAssertLessThan(measure.duration, performanceThreshold,
                         "Filter application exceeds performance threshold")
        
        // Validate filtered results
        let filteredResults = app.collectionViews["propertyListingCollectionView"].cells
        XCTAssertTrue(filteredResults.count > 0, "No filtered results found")
        
        // Test filter reset
        let resetButton = app.buttons["resetFilters"]
        XCTAssertTrue(resetButton.exists)
        resetButton.tap()
        
        // Verify filter reset
        XCTAssertFalse(bedroomFilter.isSelected)
        
        measure.stop()
    }
}