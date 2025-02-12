'use client';

import React, { useEffect, useCallback } from 'react';
import { 
  CircularProgress, 
  Alert, 
  Container, 
  Skeleton 
} from '@mui/material'; // ^5.14.0
import { useAnalytics } from '@segment/analytics-next'; // ^1.51.0
import { generateMetadata } from 'next'; // ^13.4.0
import PropertyDetails from '../../../../components/property/PropertyDetails';
import { useProperties } from '../../../../hooks/useProperties';
import ErrorBoundary from '../../../../components/common/ErrorBoundary';
import { Property } from '../../../../types/property';

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const property = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/properties/${params.id}`
    ).then(res => res.json());

    return {
      title: `${property.name} | Project X Rentals`,
      description: property.description?.slice(0, 160) || 'View property details',
      openGraph: {
        title: property.name,
        description: property.description?.slice(0, 160),
        images: property.images?.[0]?.url ? [{ url: property.images[0].url }] : [],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: property.name,
        description: property.description?.slice(0, 160),
        images: property.images?.[0]?.url ? [property.images[0].url] : [],
      },
      other: {
        'application-name': 'Project X Rentals',
        'og:site_name': 'Project X Rentals',
        'og:locale': 'en_US',
        'og:type': 'website',
      },
    };
  } catch (error) {
    return {
      title: 'Property Details | Project X Rentals',
      description: 'View rental property details',
    };
  }
}

// Property page component
const PropertyPage: React.FC<{ params: { id: string } }> = ({ params }) => {
  // Initialize hooks
  const analytics = useAnalytics();
  const { 
    properties,
    operationStates: { loading, error },
    searchProperties,
    clearCache,
  } = useProperties({
    cacheTTL: 5 * 60 * 1000, // 5 minutes cache
    debounceMs: 300,
  });

  // Find the current property from the cache or fetch it
  const property = properties.find(p => p.id === params.id);

  // Fetch property data on mount
  useEffect(() => {
    const fetchProperty = async () => {
      try {
        await searchProperties({ id: params.id });
      } catch (err) {
        console.error('Failed to fetch property:', err);
      }
    };

    fetchProperty();

    // Track page view
    analytics.track('property_details_viewed', {
      propertyId: params.id,
      timestamp: new Date().toISOString(),
    });

    // Cleanup on unmount
    return () => {
      clearCache();
    };
  }, [params.id, searchProperties, analytics, clearCache]);

  // Handle contact button click
  const handleContactClick = useCallback(async (propertyId: string) => {
    analytics.track('property_contact_initiated', {
      propertyId,
      timestamp: new Date().toISOString(),
    });

    // Navigate to contact form or open modal
    window.location.href = `/properties/${propertyId}/contact`;
  }, [analytics]);

  // Handle share functionality
  const handleShare = useCallback((propertyId: string) => {
    if (navigator.share) {
      navigator.share({
        title: property?.name || 'Property Details',
        text: property?.description || 'Check out this property',
        url: window.location.href,
      });
    }
  }, [property]);

  // Handle print functionality
  const handlePrint = useCallback((propertyId: string) => {
    window.print();
  }, []);

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="rectangular" height={400} />
        <Skeleton variant="text" sx={{ mt: 2 }} height={40} />
        <Skeleton variant="text" height={20} />
        <Skeleton variant="rectangular" sx={{ mt: 2 }} height={200} />
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert 
          severity="error" 
          action={
            <button onClick={() => searchProperties({ id: params.id })}>
              Retry
            </button>
          }
        >
          {error}
        </Alert>
      </Container>
    );
  }

  // Not found state
  if (!property) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">
          Property not found. Please check the URL and try again.
        </Alert>
      </Container>
    );
  }

  // Render property details
  return (
    <ErrorBoundary>
      <PropertyDetails
        property={property}
        onContactClick={handleContactClick}
        onShare={handleShare}
        onPrint={handlePrint}
        theme="light"
      />
    </ErrorBoundary>
  );
};

export default PropertyPage;