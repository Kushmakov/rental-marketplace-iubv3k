'use client';

import { Box, Typography, Button, useTheme } from '@mui/material'; // @version ^5.14.0
import { useRouter } from 'next/navigation'; // @version ^13.0.0
import * as ErrorTracker from '@sentry/browser'; // @version ^7.0.0
import SEO from '../components/common/SEO';
import AppBar from '../components/common/AppBar';

/**
 * Enhanced 404 error page component with accessibility features,
 * error tracking, and responsive design
 * @returns {JSX.Element} Rendered 404 page component
 */
const NotFound = (): JSX.Element => {
  const router = useRouter();
  const theme = useTheme();

  // Track 404 error occurrence
  ErrorTracker.captureEvent({
    message: '404 Page Not Found',
    level: 'warning',
    extra: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString()
    }
  });

  /**
   * Handles navigation back to home page with tracking
   */
  const handleHomeClick = (): void => {
    ErrorTracker.addBreadcrumb({
      category: 'navigation',
      message: '404 page: Clicked return to home',
      level: 'info'
    });
    router.push('/');
  };

  return (
    <>
      <SEO 
        title="Page Not Found - Project X Rental Marketplace"
        description="The page you are looking for could not be found. Please check the URL or return to our homepage."
      />

      <AppBar 
        elevated={false}
        menuConfig={{
          showNotifications: false,
          showSettings: false,
          showHome: true
        }}
      />

      <Box
        component="main"
        role="main"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: theme.spacing(3),
          backgroundColor: 'background.default',
          [theme.breakpoints.down('sm')]: {
            padding: theme.spacing(2)
          }
        }}
      >
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontSize: {
              xs: '3rem',
              sm: '4rem'
            },
            fontWeight: 700,
            color: 'text.primary',
            textAlign: 'center',
            marginBottom: theme.spacing(2)
          }}
          aria-label="404 Error"
        >
          404
        </Typography>

        <Typography
          variant="h4"
          component="h2"
          sx={{
            color: 'text.primary',
            textAlign: 'center',
            marginBottom: theme.spacing(3),
            [theme.breakpoints.down('sm')]: {
              fontSize: '1.5rem'
            }
          }}
        >
          Page Not Found
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: 'text.secondary',
            textAlign: 'center',
            maxWidth: '600px',
            marginBottom: theme.spacing(4),
            [theme.breakpoints.down('sm')]: {
              fontSize: '0.875rem'
            }
          }}
        >
          The page you are looking for might have been removed, had its name changed,
          or is temporarily unavailable. Please check the URL or return to our homepage.
        </Typography>

        <Button
          variant="contained"
          color="primary"
          onClick={handleHomeClick}
          size="large"
          aria-label="Return to homepage"
          sx={{
            minWidth: 200,
            height: 48,
            fontSize: '1rem',
            fontWeight: 500,
            [theme.breakpoints.down('sm')]: {
              minWidth: 160,
              height: 40,
              fontSize: '0.875rem'
            }
          }}
        >
          Return Home
        </Button>
      </Box>
    </>
  );
};

export default NotFound;