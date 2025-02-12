//
// ApplicationFlowUITests.swift
// ProjectXUITests
//
// Created by Project X Team
// Copyright © 2023 Project X. All rights reserved.
//

import XCTest // Version: iOS 15.0+

class ApplicationFlowUITests: XCTestCase {
    
    private var app: XCUIApplication!
    private let defaultTimeout: TimeInterval = 30.0
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["UI_TESTING"]
        app.launchEnvironment = ["ENVIRONMENT": "TEST"]
        app.launch()
        
        // Navigate to application flow
        let startApplicationButton = app.buttons["StartApplicationButton"]
        XCTAssertTrue(startApplicationButton.waitForExistence(timeout: defaultTimeout))
        startApplicationButton.tap()
    }
    
    override func tearDownWithError() throws {
        // Clean up test artifacts
        if let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? FileManager.default.removeItem(at: documentsDirectory.appendingPathComponent("TestUploads"))
        }
        
        app.terminate()
        app = nil
        
        try super.tearDownWithError()
    }
    
    func testApplicationFormSubmission() throws {
        // Test personal information form
        let nameField = app.textFields["NameTextField"]
        let emailField = app.textFields["EmailTextField"]
        let phoneField = app.textFields["PhoneTextField"]
        let employmentStatusPicker = app.pickers["EmploymentStatusPicker"]
        let incomeField = app.textFields["IncomeTextField"]
        
        XCTAssertTrue(nameField.waitForExistence(timeout: defaultTimeout))
        
        // Fill personal information
        nameField.tap()
        nameField.typeText("John Doe")
        
        emailField.tap()
        emailField.typeText("john.doe@example.com")
        
        phoneField.tap()
        phoneField.typeText("1234567890")
        
        employmentStatusPicker.tap()
        app.pickerWheels.element.adjust(toPickerWheelValue: "Employed")
        
        incomeField.tap()
        incomeField.typeText("75000")
        
        // Submit form
        let submitButton = app.buttons["SubmitButton"]
        XCTAssertTrue(submitButton.isEnabled)
        submitButton.tap()
        
        // Verify submission success
        let successMessage = app.staticTexts["SubmissionSuccessMessage"]
        XCTAssertTrue(successMessage.waitForExistence(timeout: defaultTimeout))
        
        // Verify application ID generation
        let applicationIdLabel = app.staticTexts["ApplicationIDLabel"]
        XCTAssertTrue(applicationIdLabel.exists)
        XCTAssertFalse(applicationIdLabel.label.isEmpty)
    }
    
    func testDocumentUpload() throws {
        // Navigate to document upload section
        let documentUploadButton = app.buttons["DocumentUploadButton"]
        XCTAssertTrue(documentUploadButton.waitForExistence(timeout: defaultTimeout))
        documentUploadButton.tap()
        
        // Verify supported file types
        let supportedTypesLabel = app.staticTexts["SupportedTypesLabel"]
        XCTAssertTrue(supportedTypesLabel.exists)
        
        // Test upload functionality
        let uploadButton = app.buttons["UploadDocumentButton"]
        XCTAssertTrue(uploadButton.exists)
        uploadButton.tap()
        
        // Simulate document selection
        let documentPicker = app.sheets["DocumentPicker"]
        XCTAssertTrue(documentPicker.waitForExistence(timeout: defaultTimeout))
        
        // Verify upload progress
        let progressIndicator = app.progressIndicators["UploadProgressIndicator"]
        XCTAssertTrue(progressIndicator.exists)
        
        // Verify uploaded document
        let uploadedDocumentCell = app.cells["UploadedDocumentCell"]
        XCTAssertTrue(uploadedDocumentCell.waitForExistence(timeout: defaultTimeout))
        
        // Test document preview
        uploadedDocumentCell.tap()
        let previewView = app.otherElements["DocumentPreviewView"]
        XCTAssertTrue(previewView.waitForExistence(timeout: defaultTimeout))
        
        // Test document deletion
        let deleteButton = uploadedDocumentCell.buttons["DeleteDocumentButton"]
        deleteButton.tap()
        
        let confirmDeleteButton = app.alerts["DeleteConfirmationAlert"].buttons["Delete"]
        confirmDeleteButton.tap()
        
        XCTAssertFalse(uploadedDocumentCell.exists)
    }
    
    func testApplicationValidation() throws {
        // Test empty form submission
        let submitButton = app.buttons["SubmitButton"]
        submitButton.tap()
        
        // Verify error messages
        let nameError = app.staticTexts["NameErrorLabel"]
        let emailError = app.staticTexts["EmailErrorLabel"]
        let phoneError = app.staticTexts["PhoneErrorLabel"]
        
        XCTAssertTrue(nameError.exists)
        XCTAssertTrue(emailError.exists)
        XCTAssertTrue(phoneError.exists)
        
        // Test invalid email format
        let emailField = app.textFields["EmailTextField"]
        emailField.tap()
        emailField.typeText("invalid-email")
        
        submitButton.tap()
        XCTAssertTrue(app.staticTexts["InvalidEmailFormatError"].exists)
        
        // Test invalid phone format
        let phoneField = app.textFields["PhoneTextField"]
        phoneField.tap()
        phoneField.typeText("123")
        
        submitButton.tap()
        XCTAssertTrue(app.staticTexts["InvalidPhoneFormatError"].exists)
        
        // Test maximum length validation
        let nameField = app.textFields["NameTextField"]
        let longName = String(repeating: "a", count: 101)
        nameField.tap()
        nameField.typeText(longName)
        
        XCTAssertTrue(app.staticTexts["NameMaxLengthError"].exists)
    }
    
    func testApplicationStatusTracking() throws {
        // Submit application first
        try testApplicationFormSubmission()
        
        // Navigate to status screen
        let statusButton = app.buttons["ApplicationStatusButton"]
        XCTAssertTrue(statusButton.waitForExistence(timeout: defaultTimeout))
        statusButton.tap()
        
        // Verify status components
        let statusLabel = app.staticTexts["ApplicationStatusLabel"]
        XCTAssertTrue(statusLabel.exists)
        XCTAssertEqual(statusLabel.label, "Pending Review")
        
        // Verify timeline
        let timelineView = app.scrollViews["StatusTimelineView"]
        XCTAssertTrue(timelineView.exists)
        
        // Test status filtering
        let filterButton = app.buttons["StatusFilterButton"]
        filterButton.tap()
        
        let filterSheet = app.sheets["StatusFilterSheet"]
        XCTAssertTrue(filterSheet.exists)
        
        // Test notification preferences
        let notificationButton = app.buttons["NotificationPreferencesButton"]
        notificationButton.tap()
        
        let notificationSwitch = app.switches["StatusNotificationSwitch"]
        XCTAssertTrue(notificationSwitch.exists)
        notificationSwitch.tap()
        
        // Verify export functionality
        let exportButton = app.buttons["ExportStatusButton"]
        exportButton.tap()
        
        let shareSheet = app.sheets["ShareSheet"]
        XCTAssertTrue(shareSheet.waitForExistence(timeout: defaultTimeout))
    }
}