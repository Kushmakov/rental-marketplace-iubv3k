import { ApplicationStatus, DocumentType, VerificationStatus } from '../../src/types/application';
import mockApplications from '../fixtures/applications';

// @package cypress@13.0.0
// @package @testing-library/cypress@10.0.0

/**
 * Helper function to intercept and mock API requests
 */
const mockApiRequests = () => {
  cy.intercept('GET', '/api/v1/applications/*', {
    statusCode: 200,
    body: mockApplications.applications[0]
  }).as('getApplication');

  cy.intercept('POST', '/api/v1/applications', {
    statusCode: 201,
    body: { id: 'new-app-001' }
  }).as('createApplication');

  cy.intercept('POST', '/api/v1/applications/*/documents', {
    statusCode: 200,
    body: { id: 'new-doc-001' }
  }).as('uploadDocument');
};

/**
 * Helper function to setup test environment
 */
const setupApplicationTest = () => {
  cy.clearCookies();
  cy.clearLocalStorage();
  
  // Mock authenticated user session
  cy.window().then((win) => {
    win.localStorage.setItem('authToken', 'test-token');
  });

  mockApiRequests();
  cy.visit('/applications/new');
  cy.findByRole('heading', { name: /rental application/i }).should('be.visible');
};

describe('Rental Application Form', () => {
  beforeEach(setupApplicationTest);

  it('displays multi-step form correctly', () => {
    // Verify stepper component
    cy.findByRole('navigation', { name: /application steps/i })
      .should('be.visible')
      .within(() => {
        cy.findByText(/personal information/i).should('be.visible');
        cy.findByText(/employment details/i).should('be.visible');
        cy.findByText(/documents/i).should('be.visible');
        cy.findByText(/review & submit/i).should('be.visible');
      });

    // Verify initial step is active
    cy.findByRole('form', { name: /personal information/i })
      .should('be.visible');

    // Check navigation buttons
    cy.findByRole('button', { name: /next/i }).should('be.enabled');
    cy.findByRole('button', { name: /back/i }).should('be.disabled');
  });

  it('validates required fields in personal information step', () => {
    // Try to proceed without filling required fields
    cy.findByRole('button', { name: /next/i }).click();

    // Verify error messages
    cy.findByText(/first name is required/i).should('be.visible');
    cy.findByText(/last name is required/i).should('be.visible');
    cy.findByText(/email is required/i).should('be.visible');
    cy.findByText(/phone number is required/i).should('be.visible');

    // Fill required fields
    cy.findByLabelText(/first name/i).type('John');
    cy.findByLabelText(/last name/i).type('Doe');
    cy.findByLabelText(/email/i).type('john.doe@example.com');
    cy.findByLabelText(/phone/i).type('555-0123');

    // Verify errors are cleared
    cy.findByText(/first name is required/i).should('not.exist');
    cy.findByText(/last name is required/i).should('not.exist');

    // Proceed to next step
    cy.findByRole('button', { name: /next/i }).click();
    cy.findByRole('form', { name: /employment details/i }).should('be.visible');
  });

  it('handles document upload correctly', () => {
    // Navigate to documents step
    cy.findByRole('button', { name: /next/i }).click();
    cy.findByRole('button', { name: /next/i }).click();

    // Test file upload for each document type
    const testFile = 'test-document.pdf';
    
    Object.values(DocumentType).forEach((docType) => {
      cy.findByTestId(`upload-${docType}`)
        .attachFile(testFile, { subjectType: 'drag-n-drop' });

      cy.findByTestId(`document-preview-${docType}`)
        .should('be.visible')
        .and('contain', testFile);

      cy.findByTestId(`upload-status-${docType}`)
        .should('contain', 'Uploaded successfully');
    });

    // Verify document deletion
    cy.findByTestId(`delete-${DocumentType.ID_PROOF}`).click();
    cy.findByTestId(`document-preview-${DocumentType.ID_PROOF}`)
      .should('not.exist');
  });

  it('completes full application submission flow', () => {
    // Personal Information
    cy.findByLabelText(/first name/i).type('John');
    cy.findByLabelText(/last name/i).type('Doe');
    cy.findByLabelText(/email/i).type('john.doe@example.com');
    cy.findByLabelText(/phone/i).type('555-0123');
    cy.findByRole('button', { name: /next/i }).click();

    // Employment Details
    cy.findByLabelText(/employer name/i).type('Tech Corp');
    cy.findByLabelText(/position/i).type('Software Engineer');
    cy.findByLabelText(/monthly income/i).type('8000');
    cy.findByLabelText(/employment type/i).select('FULL_TIME');
    cy.findByRole('button', { name: /next/i }).click();

    // Documents
    const testFile = 'test-document.pdf';
    cy.findByTestId(`upload-${DocumentType.ID_PROOF}`)
      .attachFile(testFile);
    cy.findByTestId(`upload-${DocumentType.INCOME_PROOF}`)
      .attachFile(testFile);
    cy.findByRole('button', { name: /next/i }).click();

    // Review & Submit
    cy.findByRole('heading', { name: /review application/i })
      .should('be.visible');
    cy.findByText(/john doe/i).should('be.visible');
    cy.findByText(/tech corp/i).should('be.visible');
    cy.findByText(/8,000/i).should('be.visible');

    // Submit application
    cy.findByRole('checkbox', { name: /terms and conditions/i }).check();
    cy.findByRole('button', { name: /submit application/i }).click();

    // Verify submission
    cy.wait('@createApplication');
    cy.url().should('include', '/applications/new-app-001');
    cy.findByText(/application submitted successfully/i).should('be.visible');
  });

  it('performs accessibility checks on all steps', () => {
    // Check initial step
    cy.injectAxe();
    cy.checkA11y();

    // Navigate through steps and check accessibility
    const steps = ['employment', 'documents', 'review'];
    steps.forEach(() => {
      cy.findByRole('button', { name: /next/i }).click();
      cy.checkA11y();
    });
  });
});

describe('Application Status Updates', () => {
  beforeEach(setupApplicationTest);

  it('displays correct status indicators', () => {
    cy.visit('/applications/app-001');
    
    cy.findByTestId('application-status')
      .should('contain', ApplicationStatus.SUBMITTED);
    
    cy.findByTestId('verification-status')
      .should('contain', VerificationStatus.IN_PROGRESS);
  });

  it('shows appropriate status messages', () => {
    cy.visit('/applications/app-001');

    // Check status message content
    cy.findByRole('alert')
      .should('contain', 'Your application is being reviewed');

    // Verify document verification indicators
    cy.findByTestId('document-status-ID_PROOF')
      .should('contain', VerificationStatus.COMPLETED);
    
    cy.findByTestId('document-status-INCOME_PROOF')
      .should('contain', VerificationStatus.IN_PROGRESS);
  });
});