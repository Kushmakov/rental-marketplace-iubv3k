import { Property, PropertyType, PropertyStatus, UnitStatus } from '../../src/types/property';
import '@axe-core/cypress/commands'; // @package @axe-core/cypress@4.7.0

// Test data constants
const PERFORMANCE_THRESHOLD = 2000; // 2s response time requirement
const MOCK_PROPERTY: Property = {
  id: '123',
  name: 'Test Property',
  description: 'Luxury downtown apartment',
  type: PropertyType.APARTMENT,
  status: PropertyStatus.ACTIVE,
  ownerId: 'owner123',
  address: {
    street1: '123 Main St',
    street2: null,
    city: 'Test City',
    state: 'TS',
    zipCode: '12345',
    country: 'USA'
  },
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 100
  },
  yearBuilt: 2020,
  totalUnits: 10,
  amenities: ['pool', 'gym'],
  images: [{
    id: 'img1',
    url: '/test-image.jpg',
    type: 'exterior',
    isPrimary: true,
    caption: 'Building exterior',
    order: 1
  }],
  units: [{
    id: 'unit1',
    propertyId: '123',
    unitNumber: '101',
    floorNumber: 1,
    status: UnitStatus.AVAILABLE,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1000,
    monthlyRent: 2000,
    securityDeposit: 2000,
    availableFrom: new Date(),
    features: ['hardwood', 'balcony'],
    images: [],
    lastUpdated: new Date()
  }],
  createdAt: new Date(),
  updatedAt: new Date()
};

beforeEach(() => {
  // Clear state and setup test environment
  cy.clearLocalStorage();
  cy.clearCookies();

  // Configure viewport for responsive testing
  cy.viewport('macbook-15');

  // Mock API responses
  cy.intercept('GET', '/api/properties', {
    statusCode: 200,
    body: [MOCK_PROPERTY],
    delay: 100 // Simulate realistic network conditions
  }).as('getProperties');

  cy.intercept('GET', '/api/properties/*', {
    statusCode: 200,
    body: MOCK_PROPERTY,
    delay: 100
  }).as('getProperty');

  // Visit properties page with performance tracking
  cy.visit('/properties', {
    onBeforeLoad: (win) => {
      win.performance.mark('start-load');
    }
  });
});

describe('Property Listing', () => {
  it('should load property grid within performance threshold', () => {
    cy.window().then((win) => {
      win.performance.mark('end-load');
      win.performance.measure('page-load', 'start-load', 'end-load');
      const measure = win.performance.getEntriesByName('page-load')[0];
      expect(measure.duration).to.be.lessThan(PERFORMANCE_THRESHOLD);
    });
  });

  it('should render property cards with correct information', () => {
    cy.get('[data-testid="property-card"]').should('be.visible').within(() => {
      cy.get('[data-testid="property-name"]').should('contain', MOCK_PROPERTY.name);
      cy.get('[data-testid="property-price"]').should('contain', '$2,000');
      cy.get('[data-testid="property-image"]').should('have.attr', 'src');
    });
  });

  it('should filter properties by type and price range', () => {
    cy.get('[data-testid="property-filters"]').within(() => {
      cy.get('[data-testid="type-filter"]').select(PropertyType.APARTMENT);
      cy.get('[data-testid="price-min"]').type('1000');
      cy.get('[data-testid="price-max"]').type('3000');
      cy.get('[data-testid="apply-filters"]').click();
    });
    cy.wait('@getProperties');
    cy.get('[data-testid="property-card"]').should('have.length.at.least', 1);
  });

  it('should pass accessibility checks', () => {
    cy.injectAxe();
    cy.checkA11y('[data-testid="property-grid"]', {
      runOnly: ['wcag2a', 'wcag2aa']
    });
  });
});

describe('Property Details', () => {
  beforeEach(() => {
    cy.visit(`/properties/${MOCK_PROPERTY.id}`);
  });

  it('should load property details within performance threshold', () => {
    cy.wait('@getProperty').its('duration').should('be.lessThan', PERFORMANCE_THRESHOLD);
  });

  it('should display complete property information', () => {
    cy.get('[data-testid="property-detail"]').within(() => {
      cy.get('[data-testid="property-name"]').should('contain', MOCK_PROPERTY.name);
      cy.get('[data-testid="property-description"]').should('contain', MOCK_PROPERTY.description);
      cy.get('[data-testid="property-amenities"]').should('contain', MOCK_PROPERTY.amenities[0]);
    });
  });

  it('should navigate image gallery correctly', () => {
    cy.get('[data-testid="property-gallery"]').within(() => {
      cy.get('[data-testid="gallery-next"]').click();
      cy.get('[data-testid="gallery-prev"]').click();
      cy.get('[data-testid="gallery-image"]').should('be.visible');
    });
  });

  it('should pass accessibility checks for detail view', () => {
    cy.injectAxe();
    cy.checkA11y('[data-testid="property-detail"]');
  });
});

describe('Property Search', () => {
  it('should search properties by location', () => {
    cy.get('[data-testid="property-search"]').within(() => {
      cy.get('[data-testid="location-input"]').type('New York');
      cy.get('[data-testid="search-button"]').click();
    });
    cy.wait('@getProperties');
    cy.get('[data-testid="property-card"]').should('exist');
  });

  it('should search with multiple filters', () => {
    cy.get('[data-testid="property-search"]').within(() => {
      cy.get('[data-testid="bedrooms-filter"]').select('2');
      cy.get('[data-testid="bathrooms-filter"]').select('2');
      cy.get('[data-testid="amenities-filter"]').click();
      cy.get('[data-testid="amenity-pool"]').click();
      cy.get('[data-testid="search-button"]').click();
    });
    cy.wait('@getProperties');
    cy.get('[data-testid="property-card"]').should('exist');
  });
});

describe('Property Interactions', () => {
  it('should save and unsave properties', () => {
    cy.get('[data-testid="property-card"]').first().within(() => {
      cy.get('[data-testid="save-button"]').click();
      cy.get('[data-testid="save-button"]').should('have.class', 'saved');
      cy.get('[data-testid="save-button"]').click();
      cy.get('[data-testid="save-button"]').should('not.have.class', 'saved');
    });
  });

  it('should share property details', () => {
    cy.get('[data-testid="property-card"]').first().within(() => {
      cy.get('[data-testid="share-button"]').click();
      cy.get('[data-testid="share-modal"]').should('be.visible');
      cy.get('[data-testid="share-email"]').should('exist');
      cy.get('[data-testid="share-copy"]').should('exist');
    });
  });

  it('should track recently viewed properties', () => {
    cy.get('[data-testid="property-card"]').first().click();
    cy.go('back');
    cy.get('[data-testid="recent-properties"]').should('contain', MOCK_PROPERTY.name);
  });
});