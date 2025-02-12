import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import PropertyCard from '../../../components/property/PropertyCard';
import { Property, PropertyType, PropertyStatus, UnitStatus } from '../../../types/property';
import { formatCurrency } from '../../../utils/currency';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock property data
const mockProperty: Property = {
  id: 'property-123',
  name: 'Luxury Downtown Apartment',
  description: 'Modern luxury apartment in downtown',
  type: PropertyType.APARTMENT,
  status: PropertyStatus.ACTIVE,
  ownerId: 'owner-123',
  address: {
    street1: '123 Main St',
    street2: null,
    city: 'Seattle',
    state: 'WA',
    zipCode: '98101',
    country: 'USA'
  },
  location: {
    latitude: 47.6062,
    longitude: -122.3321,
    accuracy: 1
  },
  yearBuilt: 2020,
  totalUnits: 2,
  amenities: ['Gym', 'Pool'],
  images: [
    {
      id: 'img-1',
      url: '/images/property-1.jpg',
      type: 'exterior',
      isPrimary: true,
      caption: 'Building exterior',
      order: 1
    }
  ],
  units: [
    {
      id: 'unit-1',
      propertyId: 'property-123',
      unitNumber: '101',
      floorNumber: 1,
      status: UnitStatus.AVAILABLE,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1000,
      monthlyRent: 2500,
      securityDeposit: 2500,
      availableFrom: new Date('2024-01-01'),
      features: ['Hardwood floors', 'Stainless appliances'],
      images: [],
      lastUpdated: new Date()
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};

// Mock handlers
const mockHandlers = {
  onViewDetails: vi.fn(),
  onSaveProperty: vi.fn()
};

// Test utilities
const renderPropertyCard = (props = {}) => {
  return render(
    <PropertyCard
      property={mockProperty}
      onViewDetails={mockHandlers.onViewDetails}
      onSaveProperty={mockHandlers.onSaveProperty}
      {...props}
    />
  );
};

describe('PropertyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render property details correctly', () => {
      renderPropertyCard();

      // Verify property name
      expect(screen.getByText(mockProperty.name)).toBeInTheDocument();

      // Verify address
      const expectedAddress = `${mockProperty.address.street1}, ${mockProperty.address.city}, ${mockProperty.address.state} ${mockProperty.address.zipCode}`;
      expect(screen.getByText(expectedAddress)).toBeInTheDocument();

      // Verify price
      const expectedPrice = `From ${formatCurrency(mockProperty.units[0].monthlyRent)}/month`;
      expect(screen.getByText(expectedPrice)).toBeInTheDocument();

      // Verify image
      const propertyImage = screen.getByRole('img', { name: `Property image for ${mockProperty.name}` });
      expect(propertyImage).toHaveAttribute('src', mockProperty.images[0].url);
    });

    it('should display "Contact for pricing" when no units are available', () => {
      const propertyNoUnits = { ...mockProperty, units: [] };
      renderPropertyCard({ property: propertyNoUnits });
      
      expect(screen.getByText('Contact for pricing')).toBeInTheDocument();
    });

    it('should apply correct styles in dark mode', () => {
      renderPropertyCard({ darkMode: true });
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        backgroundColor: 'rgb(30, 30, 30)' // Dark mode background color
      });
    });
  });

  describe('Interactions', () => {
    it('should call onViewDetails when card is clicked', async () => {
      renderPropertyCard();
      
      const card = screen.getByRole('article');
      await userEvent.click(card);
      
      expect(mockHandlers.onViewDetails).toHaveBeenCalledWith(mockProperty.id);
    });

    it('should call onSaveProperty when save button is clicked', async () => {
      renderPropertyCard();
      
      const saveButton = screen.getByRole('button', { name: /save property/i });
      await userEvent.click(saveButton);
      
      expect(mockHandlers.onSaveProperty).toHaveBeenCalledWith(mockProperty.id);
    });

    it('should prevent interactions when loading', async () => {
      renderPropertyCard({ loading: true });
      
      const card = screen.getByRole('article');
      const saveButton = screen.getByRole('button');
      
      await userEvent.click(card);
      await userEvent.click(saveButton);
      
      expect(mockHandlers.onViewDetails).not.toHaveBeenCalled();
      expect(mockHandlers.onSaveProperty).not.toHaveBeenCalled();
    });

    it('should update save button text when property is saved', () => {
      renderPropertyCard({ isSaved: true });
      
      expect(screen.getByRole('button')).toHaveTextContent('Saved');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderPropertyCard();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should be keyboard navigable', async () => {
      renderPropertyCard();
      
      const card = screen.getByRole('article');
      card.focus();
      
      expect(document.activeElement).toBe(card);
      
      // Test keyboard interaction
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(mockHandlers.onViewDetails).toHaveBeenCalled();
    });

    it('should have proper ARIA attributes', () => {
      renderPropertyCard({ loading: true });
      
      const card = screen.getByRole('article');
      const saveButton = screen.getByRole('button');
      
      expect(card).toHaveAttribute('aria-disabled', 'true');
      expect(saveButton).toHaveAttribute('aria-busy', 'true');
    });

    it('should handle reduced motion preferences', () => {
      // Mock matchMedia for prefers-reduced-motion
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      renderPropertyCard();
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        transition: 'none'
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('should adjust layout for mobile viewport', () => {
      // Mock window resize to mobile width
      window.innerWidth = 375;
      fireEvent(window, new Event('resize'));
      
      renderPropertyCard();
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        maxWidth: '100%'
      });
    });

    it('should lazy load images', () => {
      renderPropertyCard();
      
      const propertyImage = screen.getByRole('img');
      expect(propertyImage).toHaveAttribute('loading', 'lazy');
    });
  });
});