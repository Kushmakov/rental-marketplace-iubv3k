import React, { useCallback, useEffect, useMemo, useState } from 'react'; // ^18.2.0
import { 
  Box, 
  Card,
  CardMedia,
  Container,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
  IconButton,
  Skeleton,
  Divider,
  Chip,
  Button
} from '@mui/material'; // ^5.14.0
import { LoadingButton } from '@mui/lab'; // ^5.14.0
import { useAnalytics } from '@analytics/react'; // ^0.1.0
import { Property } from '../../types/property';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// Interface for component props
interface PropertyDetailsProps {
  property: Property;
  onContactClick: (propertyId: string) => Promise<void>;
  onShare: (propertyId: string) => void;
  onPrint: (propertyId: string) => void;
  theme: 'light' | 'dark';
}

// Custom hook for property details logic
const usePropertyDetails = (property: Property) => {
  const analytics = useAnalytics();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState<boolean[]>([]);

  useEffect(() => {
    // Track page view
    analytics.track('property_detail_view', {
      propertyId: property.id,
      propertyName: property.name,
      propertyType: property.type
    });

    // Initialize image load states
    setIsImageLoaded(new Array(property.images.length).fill(false));
  }, [property, analytics]);

  const handleImageLoad = useCallback((index: number) => {
    setIsImageLoaded(prev => {
      const newState = [...prev];
      newState[index] = true;
      return newState;
    });
  }, []);

  return {
    activeImageIndex,
    setActiveImageIndex,
    isLoading,
    setIsLoading,
    isImageLoaded,
    handleImageLoad
  };
};

// Main component with error boundary
const PropertyDetails: React.FC<PropertyDetailsProps> = ({
  property,
  onContactClick,
  onShare,
  onPrint,
  theme
}) => {
  const {
    activeImageIndex,
    setActiveImageIndex,
    isLoading,
    setIsLoading,
    isImageLoaded,
    handleImageLoad
  } = usePropertyDetails(property);

  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const analytics = useAnalytics();

  // Memoized property details
  const propertyDetails = useMemo(() => ({
    price: property.units.length > 0 
      ? `$${Math.min(...property.units.map(u => u.monthlyRent)).toLocaleString()}`
      : 'Contact for pricing',
    beds: property.units.length > 0
      ? `${Math.min(...property.units.map(u => u.bedrooms))} - ${Math.max(...property.units.map(u => u.bedrooms))} beds`
      : 'N/A',
    baths: property.units.length > 0
      ? `${Math.min(...property.units.map(u => u.bathrooms))} - ${Math.max(...property.units.map(u => u.bathrooms))} baths`
      : 'N/A',
    sqft: property.units.length > 0
      ? `${Math.min(...property.units.map(u => u.squareFeet))} - ${Math.max(...property.units.map(u => u.squareFeet))} sq.ft`
      : 'N/A'
  }), [property.units]);

  // Event handlers
  const handleContact = async () => {
    setIsLoading(true);
    try {
      await onContactClick(property.id);
      analytics.track('property_contact_click', { propertyId: property.id });
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = () => {
    onShare(property.id);
    analytics.track('property_share', { propertyId: property.id });
  };

  const handlePrint = () => {
    onPrint(property.id);
    analytics.track('property_print', { propertyId: property.id });
  };

  return (
    <ErrorBoundary>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={4}>
          {/* Image Gallery */}
          <Grid item xs={12} md={8}>
            <Card
              sx={{
                position: 'relative',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              {!isImageLoaded[activeImageIndex] && (
                <Skeleton
                  variant="rectangular"
                  width="100%"
                  height={isMobile ? 300 : 500}
                  animation="wave"
                />
              )}
              <CardMedia
                component="img"
                height={isMobile ? 300 : 500}
                image={property.images[activeImageIndex].url}
                alt={property.images[activeImageIndex].caption || property.name}
                onLoad={() => handleImageLoad(activeImageIndex)}
                sx={{
                  display: isImageLoaded[activeImageIndex] ? 'block' : 'none',
                  objectFit: 'cover'
                }}
              />
              {/* Image Navigation */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 1
                }}
              >
                {property.images.map((_, index) => (
                  <IconButton
                    key={index}
                    size="small"
                    onClick={() => setActiveImageIndex(index)}
                    sx={{
                      bgcolor: index === activeImageIndex ? 'primary.main' : 'rgba(255,255,255,0.7)',
                      '&:hover': { bgcolor: 'primary.light' }
                    }}
                    aria-label={`View image ${index + 1}`}
                  />
                ))}
              </Box>
            </Card>
          </Grid>

          {/* Property Information */}
          <Grid item xs={12} md={4}>
            <Box sx={{ position: 'sticky', top: 24 }}>
              <Typography variant="h4" component="h1" gutterBottom>
                {property.name}
              </Typography>
              
              <Typography variant="h5" color="primary" gutterBottom>
                {propertyDetails.price}
              </Typography>

              <Box sx={{ my: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">
                      Beds
                    </Typography>
                    <Typography variant="body1">
                      {propertyDetails.beds}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">
                      Baths
                    </Typography>
                    <Typography variant="body1">
                      {propertyDetails.baths}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">
                      Sq.Ft
                    </Typography>
                    <Typography variant="body1">
                      {propertyDetails.sqft}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Amenities */}
              <Typography variant="h6" gutterBottom>
                Amenities
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {property.amenities.map((amenity, index) => (
                  <Chip
                    key={index}
                    label={amenity}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LoadingButton
                  variant="contained"
                  fullWidth
                  loading={isLoading}
                  onClick={handleContact}
                  aria-label="Contact about this property"
                >
                  Contact
                </LoadingButton>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={handleShare}
                    aria-label="Share property"
                  >
                    Share
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={handlePrint}
                    aria-label="Print property details"
                  >
                    Print
                  </Button>
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Description */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              About this property
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              {property.description}
            </Typography>
          </Grid>
        </Grid>
      </Container>
    </ErrorBoundary>
  );
};

export default PropertyDetails;