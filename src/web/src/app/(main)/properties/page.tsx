'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Container, Typography } from '@mui/material'; // @mui/material@5.14.0
import { useSearchParams } from 'next/navigation'; // next@13.0.0
import { useDebounce } from 'use-debounce'; // use-debounce@9.0.0

import PropertyGrid from '../../../components/property/PropertyGrid';
import PropertyFilters from '../../../components/property/PropertyFilters';
import { useProperties } from '../../../hooks/useProperties';
import { PropertyType, PropertySearchFilters } from '../../../types/property';
import { formatCurrency } from '../../../utils/currency';

/**
 * Main property listing page component with enhanced performance features
 * Implements virtualized rendering, optimistic updates, and advanced caching
 */
const PropertiesPage: React.FC = () => {
  // Initialize hooks and state
  const searchParams = useSearchParams();
  const [filterState, setFilterState] = useState<PropertySearchFilters>(() => ({
    propertyType: (searchParams.get('type') as PropertyType) || undefined,
    minPrice: Number(searchParams.get('minPrice')) || undefined,
    maxPrice: Number(searchParams.get('maxPrice')) || undefined,
    bedrooms: Number(searchParams.get('bedrooms')) || undefined,
    bathrooms: Number(searchParams.get('bathrooms')) || undefined,
    amenities: searchParams.get('amenities')?.split(',') || undefined,
    location: searchParams.get('location') ? {
      latitude: Number(searchParams.get('lat')),
      longitude: Number(searchParams.get('lng')),
      radiusInMiles: Number(searchParams.get('radius')) || 10
    } : undefined
  }));

  // Initialize properties hook with caching
  const {
    properties,
    operationStates: { loading, error },
    searchProperties,
    clearCache,
    refreshProperties
  } = useProperties({
    cacheTTL: 5 * 60 * 1000, // 5 minutes cache
    debounceMs: 300,
    batchSize: 20
  });

  // Debounced filter handler to prevent excessive API calls
  const [debouncedFilterChange] = useDebounce(
    (filters: PropertySearchFilters) => {
      // Update URL params
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'location' && value) {
            params.set('lat', value.latitude.toString());
            params.set('lng', value.longitude.toString());
            params.set('radius', value.radiusInMiles?.toString() || '10');
          } else if (Array.isArray(value)) {
            params.set(key, value.join(','));
          } else {
            params.set(key, value.toString());
          }
        }
      });
      window.history.replaceState({}, '', `?${params.toString()}`);

      // Trigger search
      searchProperties(filters);
    },
    300
  );

  // Handle filter changes
  const handleFilterChange = useCallback((filters: PropertySearchFilters) => {
    setFilterState(filters);
    debouncedFilterChange(filters);
  }, [debouncedFilterChange]);

  // Handle filter reset
  const handleFilterReset = useCallback(() => {
    setFilterState({});
    clearCache();
    refreshProperties();
  }, [clearCache, refreshProperties]);

  // Initial search on mount
  useEffect(() => {
    searchProperties(filterState);
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Available Properties
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {properties.length} properties found
          {filterState.minPrice && ` from ${formatCurrency(filterState.minPrice)}`}
        </Typography>
      </Box>

      <PropertyFilters
        onFilterChange={handleFilterChange}
        initialFilters={filterState}
        isLoading={loading}
        error={error || undefined}
        onReset={handleFilterReset}
      />

      <Box sx={{ mt: 4 }}>
        <PropertyGrid
          properties={properties}
          loading={loading}
          onPropertyClick={(id) => {
            // Property click handling will be implemented by the routing system
            window.location.href = `/properties/${id}`;
          }}
          onSaveProperty={(id) => {
            // Save property handling will be implemented by the favorites system
            console.log('Save property:', id);
          }}
          sortBy={{
            field: 'price',
            direction: 'asc'
          }}
          filters={filterState}
          pageSize={20}
          onLoadMore={() => {
            // Load more handling for infinite scroll
            if (!loading && properties.length > 0) {
              searchProperties({
                ...filterState,
                offset: properties.length
              });
            }
          }}
        />
      </Box>
    </Container>
  );
};

export default PropertiesPage;