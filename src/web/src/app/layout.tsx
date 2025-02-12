'use client';

import React, { useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box, Container } from '@mui/material'; // @mui/material@5.14.0
import AppBar from '../components/common/AppBar';
import Footer from '../components/common/Footer';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { lightTheme } from '../styles/theme';

// Metadata interface for SEO and document head configuration
interface MetadataProps {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
}

// Props interface for the root layout component
interface RootLayoutProps {
  children: React.ReactNode;
  lang?: string;
  metadata?: MetadataProps;
}

// Root layout component providing the application shell
const RootLayout: React.FC<RootLayoutProps> = ({
  children,
  lang = 'en',
  metadata = {
    title: 'Project X - Rental Marketplace Platform',
    description: 'Comprehensive rental marketplace platform transforming the apartment leasing process',
    keywords: ['rental', 'marketplace', 'apartments', 'leasing', 'property management'],
    ogImage: '/images/og-image.jpg'
  }
}) => {
  // Set up CSP headers for security
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Content Security Policy setup
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval';
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' data:;
        connect-src 'self' https://api.projectx.com;
      `;
      document.head.appendChild(meta);
    }
  }, []);

  // Set up web vitals tracking
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Report Web Vitals
      const reportWebVitals = (metric: any) => {
        console.log(metric); // Replace with actual analytics implementation
      };

      // @ts-ignore - Web Vitals types
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(reportWebVitals);
        getFID(reportWebVitals);
        getFCP(reportWebVitals);
        getLCP(reportWebVitals);
        getTTFB(reportWebVitals);
      });
    }
  }, []);

  // Handle error logging and monitoring
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log to monitoring service - implementation would depend on monitoring solution
    console.error('Application Error:', error, errorInfo);
  };

  return (
    <html lang={lang}>
      <head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />
        <meta name="keywords" content={metadata.keywords?.join(', ')} />
        <meta property="og:title" content={metadata.title} />
        <meta property="og:description" content={metadata.description} />
        <meta property="og:image" content={metadata.ogImage} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content={lightTheme.palette.primary.main} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ThemeProvider theme={lightTheme}>
          <CssBaseline />
          <ErrorBoundary
            onError={handleError}
            showToast={true}
            enableDevelopmentLogging={process.env.NODE_ENV === 'development'}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
                backgroundColor: 'background.default'
              }}
            >
              <AppBar
                elevated={true}
                position="fixed"
                enableSessionSync={true}
                menuConfig={{
                  showNotifications: true,
                  showSettings: true,
                  showHome: true
                }}
              />
              <Box
                component="main"
                sx={{
                  flexGrow: 1,
                  paddingTop: { xs: '56px', sm: '64px' }, // Adjust for AppBar height
                  paddingBottom: { xs: 4, sm: 6 }
                }}
              >
                <Container
                  maxWidth="lg"
                  sx={{
                    paddingTop: { xs: 2, sm: 4 },
                    paddingBottom: { xs: 2, sm: 4 }
                  }}
                >
                  {children}
                </Container>
              </Box>
              <Footer
                elevated={true}
                condensed={false}
                analytics={{
                  trackEvent: (id: string) => {
                    // Implement analytics tracking
                    console.log('Track event:', id);
                  }
                }}
              />
            </Box>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;