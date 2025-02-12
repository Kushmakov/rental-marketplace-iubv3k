import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid, Box, useTheme, useMediaQuery, styled } from '@mui/material'; // @mui/material@5.14.0
import { FixedSizeGrid } from 'react-window'; // @react-window@1.8.9
import { useIntersectionObserver } from 'react-intersection-observer'; // @react-intersection-observer@9.5.2
import { ErrorBoundary } from 'react-error-boundary'; // @react-error-boundary@4.0.11

import { Property } from '../../types/property';
import PropertyCard from './PropertyCard';

// Interfaces
interface PropertyGridProps {
  properties: Property[];
  loading?: boolean;
  onPropertyClick: (propertyId: string) => void;
  onSaveProperty: (propertyId: string) => void;
  sortBy?: SortOption;
  filters?: FilterOptions;
  pageSize?: number;
  onLoadMore?: () => void;
  savedProperties?: Set<string>;
}

interface SortOption {
  field: 'price' | 'date' | 'name';
  direction: 'asc' | 'desc';
}

interface FilterOptions {
  priceRange?: { min: number; max: number };
  propertyType?: string[];
  bedrooms?: number;
  bathrooms?: number;
}

// Styled components
const GridContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  height: '100%',
  padding: theme.spacing(2),
  position: 'relative',
  '&:focus': {
    outline: 'none',
  },
}));

const LoadingIndicator = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: theme.spacing(2),
  left: '50%',
  transform: 'translateX(-50%)',
  padding: theme.spacing(1),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
}));

// Custom hook for keyboard navigation
const useGridKeyboardNavigation = (rowCount: number, columnCount: number) => {
  const [focusedCell, setFocusedCell] = useState<[number, number]>([0, 0]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const [row, col] = focusedCell;

    switch (event.key) {
      case 'ArrowRight':
        if (col < columnCount - 1) setFocusedCell([row, col + 1]);
        event.preventDefault();
        break;
      case 'ArrowLeft':
        if (col > 0) setFocusedCell([row, col - 1]);
        event.preventDefault();
        break;
      case 'ArrowDown':
        if (row < rowCount - 1) setFocusedCell([row + 1, col]);
        event.preventDefault();
        break;
      case 'ArrowUp':
        if (row > 0) setFocusedCell([row - 1, col]);
        event.preventDefault();
        break;
    }
  }, [focusedCell, rowCount, columnCount]);

  return { focusedCell, handleKeyDown };
};

// Error Fallback component
const GridErrorFallback = ({ error }: { error: Error }) => (
  <Box role="alert" p={2} textAlign="center">
    <h3>Error loading properties</h3>
    <pre>{error.message}</pre>
  </Box>
);

// Main component
const PropertyGrid = React.memo<PropertyGridProps>(({
  properties,
  loading = false,
  onPropertyClick,
  onSaveProperty,
  sortBy,
  filters,
  pageSize = 20,
  onLoadMore,
  savedProperties = new Set(),
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  // Calculate grid dimensions
  const getGridDimensions = useCallback(() => {
    const columnCount = isMobile ? 1 : isTablet ? 2 : 3;
    const cardWidth = isMobile ? window.innerWidth - 32 : 345;
    const cardHeight = 400;
    const rowCount = Math.ceil(properties.length / columnCount);

    return { columnCount, rowCount, cardWidth, cardHeight };
  }, [isMobile, isTablet]);

  const { columnCount, rowCount, cardWidth, cardHeight } = useMemo(
    () => getGridDimensions(),
    [getGridDimensions]
  );

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useIntersectionObserver({
    threshold: 0.5,
    delay: 100,
  });

  useEffect(() => {
    if (inView && onLoadMore && !loading) {
      onLoadMore();
    }
  }, [inView, onLoadMore, loading]);

  // Keyboard navigation
  const { focusedCell, handleKeyDown } = useGridKeyboardNavigation(rowCount, columnCount);

  // Grid cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: any) => {
    const index = rowIndex * columnCount + columnIndex;
    const property = properties[index];

    if (!property) return null;

    const isFocused = focusedCell[0] === rowIndex && focusedCell[1] === columnIndex;
    const isSaved = savedProperties.has(property.id);

    return (
      <Box
        style={style}
        padding={1}
        data-testid={`property-card-${index}`}
      >
        <PropertyCard
          property={property}
          loading={loading}
          onViewDetails={onPropertyClick}
          onSaveProperty={onSaveProperty}
          isSaved={isSaved}
          isAccessible={!loading}
          testId={`property-${property.id}`}
        />
      </Box>
    );
  }, [properties, loading, onPropertyClick, onSaveProperty, focusedCell, savedProperties, columnCount]);

  return (
    <ErrorBoundary FallbackComponent={GridErrorFallback}>
      <GridContainer
        role="grid"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Property listings grid"
      >
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={cardWidth}
          height={window.innerHeight - 200}
          rowCount={rowCount}
          rowHeight={cardHeight}
          width="100%"
          itemData={properties}
        >
          {Cell}
        </FixedSizeGrid>

        {onLoadMore && (
          <Box ref={loadMoreRef} height={20} />
        )}

        {loading && (
          <LoadingIndicator role="status" aria-live="polite">
            Loading more properties...
          </LoadingIndicator>
        )}
      </GridContainer>
    </ErrorBoundary>
  );
});

PropertyGrid.displayName = 'PropertyGrid';

export default PropertyGrid;