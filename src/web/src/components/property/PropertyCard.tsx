import React, { useMemo } from 'react';
import { Card, CardMedia, CardContent, Typography, styled } from '@mui/material'; // @mui/material@5.14.0
import { Property } from '../../types/property';
import LoadingButton from '../common/LoadingButton';
import { formatCurrency } from '../../utils/currency';

// Props interface with comprehensive type definitions
interface PropertyCardProps {
  property: Property;
  loading?: boolean;
  onViewDetails: (propertyId: string) => void;
  onSaveProperty: (propertyId: string) => void;
  isSaved?: boolean;
  isAccessible?: boolean;
  testId?: string;
}

// Enhanced Material-UI Card with interactive features
const StyledCard = styled(Card)(({ theme }) => ({
  maxWidth: 345,
  cursor: 'pointer',
  transition: theme.transitions.create(['box-shadow', 'transform'], {
    duration: theme.transitions.duration.standard,
  }),
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[4],
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 1.5,
  position: 'relative',
}));

// Optimized CardMedia for property images
const PropertyImage = styled(CardMedia)({
  height: 200,
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  '&.MuiCardMedia-root': {
    position: 'relative',
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
});

// Helper function to calculate minimum rental price
const getMinRentalPrice = (units: Property['units']): number => {
  if (!units || units.length === 0) return 0;
  
  const availableUnits = units.filter(unit => unit.status === 'AVAILABLE');
  if (availableUnits.length === 0) return 0;
  
  const prices = availableUnits.map(unit => unit.monthlyRent);
  return Math.min(...prices);
};

// Memoized property card component
const PropertyCard: React.FC<PropertyCardProps> = React.memo(({
  property,
  loading = false,
  onViewDetails,
  onSaveProperty,
  isSaved = false,
  isAccessible = true,
  testId,
}) => {
  // Memoize expensive calculations
  const primaryImage = useMemo(() => {
    const primary = property.images.find(img => img.isPrimary);
    return primary?.url || property.images[0]?.url || '/images/placeholder-property.jpg';
  }, [property.images]);

  const minRentalPrice = useMemo(() => 
    getMinRentalPrice(property.units),
    [property.units]
  );

  const formattedAddress = useMemo(() => {
    const { street1, city, state, zipCode } = property.address;
    return `${street1}, ${city}, ${state} ${zipCode}`;
  }, [property.address]);

  // Event handlers
  const handleCardClick = () => {
    if (!loading && isAccessible) {
      onViewDetails(property.id);
    }
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loading && isAccessible) {
      onSaveProperty(property.id);
    }
  };

  return (
    <StyledCard
      onClick={handleCardClick}
      data-testid={testId}
      aria-disabled={!isAccessible || loading}
      tabIndex={isAccessible ? 0 : -1}
      role="article"
    >
      <PropertyImage
        image={primaryImage}
        title={property.name}
        loading="lazy"
        aria-label={`Property image for ${property.name}`}
      />
      
      <CardContent>
        <Typography 
          variant="h6" 
          component="h2" 
          gutterBottom 
          noWrap
          title={property.name}
        >
          {property.name}
        </Typography>

        <Typography 
          variant="body2" 
          color="text.secondary" 
          gutterBottom
          sx={{ mb: 2 }}
          noWrap
          title={formattedAddress}
        >
          {formattedAddress}
        </Typography>

        <Typography 
          variant="h6" 
          color="primary" 
          gutterBottom
          sx={{ fontWeight: 600 }}
        >
          {minRentalPrice > 0 
            ? `From ${formatCurrency(minRentalPrice)}/month`
            : 'Contact for pricing'}
        </Typography>

        <LoadingButton
          onClick={handleSaveClick}
          loading={loading}
          disabled={!isAccessible}
          variant={isSaved ? 'contained' : 'outlined'}
          color={isSaved ? 'primary' : 'secondary'}
          size="small"
          fullWidth
          sx={{ mt: 1 }}
          aria-label={isSaved ? 'Remove from saved properties' : 'Save property'}
        >
          {isSaved ? 'Saved' : 'Save'}
        </LoadingButton>
      </CardContent>
    </StyledCard>
  );
});

PropertyCard.displayName = 'PropertyCard';

export default PropertyCard;