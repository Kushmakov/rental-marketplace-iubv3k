import React, { useState, useCallback, useEffect } from 'react';
import { Box, Slider, Select, Checkbox, TextField, CircularProgress, Alert, Button, FormControl, InputLabel, MenuItem, FormControlLabel, Typography } from '@mui/material';
import { useMediaQuery } from '@mui/material';
import { useDebounce } from 'use-debounce';
import { PropertyType } from '../../types/property';
import { getCurrentPosition } from '../../utils/geolocation';

interface PropertyFiltersProps {
  onFilterChange: (filters: PropertyFilterState) => void;
  initialFilters?: PropertyFilterState;
  isLoading?: boolean;
  error?: string;
  onReset?: () => void;
}

interface PropertyFilterState {
  propertyType: PropertyType | '';
  priceRange: {
    min: number;
    max: number;
    isValid: boolean;
  };
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  radius: number;
  validation: {
    [key: string]: {
      isValid: boolean;
      message?: string;
    };
  };
}

const DEFAULT_PRICE_RANGE = { min: 0, max: 10000, isValid: true };
const DEFAULT_RADIUS = 10;
const COMMON_AMENITIES = [
  'Parking',
  'Pool',
  'Gym',
  'Laundry',
  'Dishwasher',
  'Air Conditioning',
  'Pets Allowed',
  'Furnished'
];

export const PropertyFilters: React.FC<PropertyFiltersProps> = ({
  onFilterChange,
  initialFilters,
  isLoading = false,
  error,
  onReset
}) => {
  const isMobile = useMediaQuery('(max-width:768px)');
  
  const [filters, setFilters] = useState<PropertyFilterState>({
    propertyType: initialFilters?.propertyType || '',
    priceRange: initialFilters?.priceRange || DEFAULT_PRICE_RANGE,
    bedrooms: initialFilters?.bedrooms || 0,
    bathrooms: initialFilters?.bathrooms || 0,
    amenities: initialFilters?.amenities || [],
    location: initialFilters?.location,
    radius: initialFilters?.radius || DEFAULT_RADIUS,
    validation: {
      priceRange: { isValid: true },
      location: { isValid: true }
    }
  });

  const [debouncedFilters] = useDebounce(filters, 500);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    onFilterChange(debouncedFilters);
  }, [debouncedFilters, onFilterChange]);

  const handleFilterChange = useCallback((filterName: string, value: any) => {
    setFilters(prev => {
      const validation = { ...prev.validation };

      // Validate price range
      if (filterName === 'priceRange') {
        validation.priceRange = {
          isValid: value.min >= 0 && value.max > value.min,
          message: value.min >= 0 && value.max > value.min ? 
            undefined : 
            'Invalid price range'
        };
      }

      return {
        ...prev,
        [filterName]: value,
        validation
      };
    });
  }, []);

  const handleLocationSearch = async (searchQuery: string) => {
    setLocationLoading(true);
    try {
      if (!searchQuery && navigator.geolocation) {
        const position = await getCurrentPosition();
        handleFilterChange('location', {
          latitude: position.latitude,
          longitude: position.longitude,
          address: 'Current Location'
        });
      } else {
        // Note: Actual geocoding implementation would go here
        // This is a placeholder for the geocoding service integration
        console.log('Geocoding service would be called here with:', searchQuery);
      }
    } catch (error) {
      handleFilterChange('validation', {
        ...filters.validation,
        location: {
          isValid: false,
          message: error instanceof Error ? error.message : 'Location error'
        }
      });
    } finally {
      setLocationLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({
      propertyType: '',
      priceRange: DEFAULT_PRICE_RANGE,
      bedrooms: 0,
      bathrooms: 0,
      amenities: [],
      radius: DEFAULT_RADIUS,
      validation: {
        priceRange: { isValid: true },
        location: { isValid: true }
      }
    });
    onReset?.();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 2,
        p: 2,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        boxShadow: 1
      }}
      role="search"
      aria-label="Property filters"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <FormControl fullWidth>
        <InputLabel id="property-type-label">Property Type</InputLabel>
        <Select
          labelId="property-type-label"
          value={filters.propertyType}
          onChange={(e) => handleFilterChange('propertyType', e.target.value)}
          label="Property Type"
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value={PropertyType.APARTMENT}>Apartment</MenuItem>
          <MenuItem value={PropertyType.HOUSE}>House</MenuItem>
          <MenuItem value={PropertyType.CONDO}>Condo</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ width: '100%' }}>
        <Typography id="price-range-slider" gutterBottom>
          Price Range
        </Typography>
        <Slider
          value={[filters.priceRange.min, filters.priceRange.max]}
          onChange={(_, value) => handleFilterChange('priceRange', {
            min: Array.isArray(value) ? value[0] : 0,
            max: Array.isArray(value) ? value[1] : 10000,
            isValid: true
          })}
          valueLabelDisplay="auto"
          min={0}
          max={10000}
          step={100}
          aria-labelledby="price-range-slider"
          sx={{ mt: 2 }}
        />
      </Box>

      <FormControl>
        <InputLabel id="bedrooms-label">Bedrooms</InputLabel>
        <Select
          labelId="bedrooms-label"
          value={filters.bedrooms}
          onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
          label="Bedrooms"
        >
          <MenuItem value={0}>Any</MenuItem>
          {[1, 2, 3, 4, '5+'].map((num) => (
            <MenuItem key={num} value={num}>{num}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl>
        <InputLabel id="bathrooms-label">Bathrooms</InputLabel>
        <Select
          labelId="bathrooms-label"
          value={filters.bathrooms}
          onChange={(e) => handleFilterChange('bathrooms', e.target.value)}
          label="Bathrooms"
        >
          <MenuItem value={0}>Any</MenuItem>
          {[1, 1.5, 2, 2.5, 3, '3+'].map((num) => (
            <MenuItem key={num} value={num}>{num}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ width: '100%' }}>
        <TextField
          fullWidth
          label="Location"
          value={filters.location?.address || ''}
          onChange={(e) => handleLocationSearch(e.target.value)}
          error={!filters.validation.location?.isValid}
          helperText={filters.validation.location?.message}
          InputProps={{
            endAdornment: locationLoading && <CircularProgress size={20} />
          }}
        />
        {filters.location && (
          <Slider
            value={filters.radius}
            onChange={(_, value) => handleFilterChange('radius', value)}
            aria-label="Search radius"
            valueLabelDisplay="auto"
            min={1}
            max={50}
            marks
            sx={{ mt: 2 }}
          />
        )}
      </Box>

      <Box sx={{ width: '100%' }}>
        <Typography gutterBottom>Amenities</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {COMMON_AMENITIES.map((amenity) => (
            <FormControlLabel
              key={amenity}
              control={
                <Checkbox
                  checked={filters.amenities.includes(amenity)}
                  onChange={(e) => {
                    const newAmenities = e.target.checked
                      ? [...filters.amenities, amenity]
                      : filters.amenities.filter(a => a !== amenity);
                    handleFilterChange('amenities', newAmenities);
                  }}
                />
              }
              label={amenity}
            />
          ))}
        </Box>
      </Box>

      <Button
        onClick={handleReset}
        variant="outlined"
        disabled={isLoading}
        sx={{ alignSelf: 'flex-start' }}
      >
        Reset Filters
      </Button>
    </Box>
  );
};

export default PropertyFilters;