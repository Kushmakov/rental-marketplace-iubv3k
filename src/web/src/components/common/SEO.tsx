import Head from 'next/head';
import { Property } from '../../types/property';

/**
 * Props interface for SEO component with comprehensive type definitions
 */
interface SEOProps {
  title: string;
  description: string;
  image?: string;
  canonicalUrl?: string;
  property?: Property;
}

/**
 * SEO component for managing comprehensive meta tags and document head content
 * Implements dynamic SEO optimization with support for property-specific content
 * @version 1.0.0
 */
const SEO: React.FC<SEOProps> = ({
  title,
  description,
  image,
  canonicalUrl,
  property
}) => {
  // Base URL for the application
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://projectx.com';
  
  // Construct full image URL
  const imageUrl = image ? (image.startsWith('http') ? image : `${baseUrl}${image}`) : `${baseUrl}/default-og-image.jpg`;

  // Generate property-specific structured data if property is provided
  const getPropertyStructuredData = () => {
    if (!property) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: property.name,
      description: property.description,
      image: property.images?.[0]?.url || imageUrl,
      address: {
        '@type': 'PostalAddress',
        streetAddress: property.address.street1,
        addressLocality: property.address.city,
        addressRegion: property.address.state,
        postalCode: property.address.zipCode,
        addressCountry: property.address.country
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: property.location.latitude,
        longitude: property.location.longitude
      },
      datePosted: property.createdAt,
      dateModified: property.updatedAt
    };
  };

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      
      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:type" content={property ? 'realestate.listing' : 'website'} />
      <meta property="og:url" content={canonicalUrl || baseUrl} />
      <meta property="og:site_name" content="Project X Rental Marketplace" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      
      {/* Property-specific Meta Tags */}
      {property && (
        <>
          <meta property="og:price:amount" content={property.units[0]?.monthlyRent.toString()} />
          <meta property="og:price:currency" content="USD" />
          <meta name="robots" content="index, follow" />
          <meta name="geo.position" content={`${property.location.latitude};${property.location.longitude}`} />
          <meta name="geo.placename" content={`${property.address.city}, ${property.address.state}`} />
        </>
      )}
      
      {/* Structured Data */}
      {property && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getPropertyStructuredData())
          }}
        />
      )}
      
      {/* Additional Meta Tags */}
      <meta name="format-detection" content="telephone=no" />
      <meta name="theme-color" content="#ffffff" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </Head>
  );
};

export default SEO;