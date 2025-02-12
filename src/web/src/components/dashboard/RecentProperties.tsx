import React, { useMemo, useCallback } from 'react';
import { Grid, Box, Typography, Alert } from '@mui/material'; // @mui/material@5.14.0
import { useVirtualizer } from '@tanstack/react-virtual'; // @tanstack/react-virtual@3.0.0
import { Property } from '../../types/property';
import { PropertyCard } from '../property/PropertyCard';
import { useProperties } from '../../hooks/useProperties';

/**
 * Props interface for the RecentProperties component
 */
interface RecentPropertiesProps {
  limit?: number;
  onViewDetails?: (propertyId: string) => void;
  enableVirtualization?: boolean;
  errorConfig?: {
    retryDelay?: number;
    maxRetries?: number;
  };
}

/**
 * Memoized hook for sorting properties by last modified date
 */
const useSortedProperties = (properties: Property[]): Property[] => {
  return useMemo(() => {
    if (!properties.length) return [];
    
    return [...properties].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [properties]);
};

/**
 * RecentProperties Component
 * Displays a grid of recently updated properties with virtualization support
 * and comprehensive error handling
 */
const RecentProperties: React.FC<RecentPropertiesProps> = ({
  limit = 12,
  onViewDetails,
  enableVirtualization = true,
  errorConfig = { retryDelay: 3000, maxRetries: 3 }
}) => {
  // Fetch properties using the enhanced hook
  const {
    properties,
    operationStates: { loading, error },
    searchProperties,
    refreshProperties
  } = useProperties({
    cacheTTL: 5 * 60 * 1000, // 5 minutes cache
    debounceMs: 300
  });

  // Sort properties by last modified date
  const sortedProperties = useSortedProperties(properties);
  const displayProperties = useMemo(() => 
    sortedProperties.slice(0, limit),
    [sortedProperties, limit]
  );

  // Setup virtualization if enabled
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: displayProperties.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 350, // Estimated height of property card
    overscan: 2,
    enabled: enableVirtualization
  });

  // Handle property view details
  const handleViewDetails = useCallback((propertyId: string) => {
    if (onViewDetails) {
      onViewDetails(propertyId);
    }
  }, [onViewDetails]);

  // Handle property save
  const handleSaveProperty = useCallback((propertyId: string) => {
    // Implement save functionality
    console.log('Save property:', propertyId);
  }, []);

  // Handle retry on error
  const handleRetry = useCallback(async () => {
    try {
      await refreshProperties();
    } catch (err) {
      console.error('Failed to refresh properties:', err);
    }
  }, [refreshProperties]);

  // Render loading state
  if (loading && !displayProperties.length) {
    return (
      <Box sx={{ p: 2 }}>
        <Grid container spacing={3}>
          {[...Array(limit)].map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <PropertyCard
                property={{} as Property}
                loading={true}
                onViewDetails={() => {}}
                onSaveProperty={() => {}}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Render error state
  if (error && !displayProperties.length) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert 
          severity="error" 
          action={
            <LoadingButton
              onClick={handleRetry}
              variant="outlined"
              size="small"
              loading={loading}
            >
              Retry
            </LoadingButton>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  // Render empty state
  if (!displayProperties.length) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No properties available
        </Typography>
      </Box>
    );
  }

  // Render properties grid with virtualization support
  return (
    <Box
      ref={parentRef}
      sx={{
        p: 2,
        height: '100%',
        overflowY: enableVirtualization ? 'auto' : 'visible'
      }}
    >
      <Grid container spacing={3} sx={{ minHeight: virtualizer.getTotalSize() }}>
        {enableVirtualization ? (
          virtualizer.getVirtualItems().map((virtualRow) => (
            <Grid 
              item 
              xs={12} 
              sm={6} 
              md={4} 
              lg={3} 
              key={virtualRow.key}
              sx={{
                transform: `translateY(${virtualRow.start}px)`,
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%'
              }}
            >
              <PropertyCard
                property={displayProperties[virtualRow.index]}
                onViewDetails={handleViewDetails}
                onSaveProperty={handleSaveProperty}
                loading={loading}
                testId={`property-card-${virtualRow.index}`}
              />
            </Grid>
          ))
        ) : (
          displayProperties.map((property, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={property.id}>
              <PropertyCard
                property={property}
                onViewDetails={handleViewDetails}
                onSaveProperty={handleSaveProperty}
                loading={loading}
                testId={`property-card-${index}`}
              />
            </Grid>
          ))
        )}
      </Grid>
    </Box>
  );
};

export default React.memo(RecentProperties);