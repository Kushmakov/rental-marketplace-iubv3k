'use client';

import React, { useEffect, useState } from 'react'; // ^18.2.0
import { Box, Typography, Button, CircularProgress } from '@mui/material'; // ^5.14.0
import { ErrorOutline, Refresh, Home } from '@mui/icons-material'; // ^5.14.0
import { useRouter } from 'next/navigation'; // ^13.0.0
import Toast from '../../components/common/Toast';

// Interface definitions
interface ErrorPageProps {
  error: Error | null;
  reset: () => void;
  statusCode?: number;
  errorId?: string;
}

interface ErrorState {
  retryCount: number;
  isRetrying: boolean;
  showToast: boolean;
}

// Maximum retry attempts before giving up
const MAX_RETRY_ATTEMPTS = 3;

// Error page component with comprehensive error handling
const Error: React.FC<ErrorPageProps> = ({ error, reset, statusCode = 500, errorId }) => {
  const router = useRouter();
  const [state, setState] = useState<ErrorState>({
    retryCount: 0,
    isRetrying: false,
    showToast: true,
  });

  // Error logging and monitoring
  useEffect(() => {
    if (error) {
      // Log error details in production-safe manner
      console.error('Error occurred:', {
        errorId,
        statusCode,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }, [error, errorId, statusCode]);

  // Determine error severity and message
  const getErrorDetails = () => {
    if (!error) return { severity: 'error', message: 'An unknown error occurred' };

    switch (statusCode) {
      case 404:
        return { severity: 'warning', message: 'The requested page could not be found' };
      case 403:
        return { severity: 'error', message: 'You do not have permission to access this resource' };
      case 401:
        return { severity: 'warning', message: 'Please log in to access this resource' };
      default:
        return { severity: 'error', message: 'An unexpected error occurred' };
    }
  };

  // Handle retry with exponential backoff
  const handleRetry = async () => {
    if (state.retryCount >= MAX_RETRY_ATTEMPTS) {
      setState(prev => ({ ...prev, showToast: true }));
      return;
    }

    setState(prev => ({ ...prev, isRetrying: true }));
    
    try {
      // Exponential backoff delay
      const delay = Math.pow(2, state.retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await reset();
      setState(prev => ({
        ...prev,
        isRetrying: false,
        retryCount: prev.retryCount + 1,
      }));
    } catch (retryError) {
      setState(prev => ({
        ...prev,
        isRetrying: false,
        showToast: true,
      }));
    }
  };

  // Navigate to home/dashboard
  const handleNavigateHome = () => {
    router.push('/');
  };

  const { severity, message } = getErrorDetails();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 3,
        textAlign: 'center',
      }}
    >
      <ErrorOutline
        sx={{
          fontSize: 64,
          color: theme => theme.palette[severity].main,
          marginBottom: 2,
        }}
      />
      
      <Typography variant="h4" gutterBottom>
        Oops! Something went wrong
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        {message}
      </Typography>
      
      {errorId && (
        <Typography variant="caption" color="text.secondary" paragraph>
          Error ID: {errorId}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, marginTop: 3 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleRetry}
          disabled={state.isRetrying || state.retryCount >= MAX_RETRY_ATTEMPTS}
          startIcon={state.isRetrying ? <CircularProgress size={20} /> : <Refresh />}
        >
          {state.isRetrying ? 'Retrying...' : 'Try Again'}
        </Button>

        <Button
          variant="outlined"
          color="primary"
          onClick={handleNavigateHome}
          startIcon={<Home />}
        >
          Go to Dashboard
        </Button>
      </Box>

      <Toast
        open={state.showToast}
        onClose={() => setState(prev => ({ ...prev, showToast: false }))}
        message={
          state.retryCount >= MAX_RETRY_ATTEMPTS
            ? 'Maximum retry attempts reached. Please try again later.'
            : 'Error occurred while retrying. Please try again.'
        }
        severity={severity}
        autoHideDuration={6000}
      />
    </Box>
  );
};

// Static method for Next.js error page initialization
Error.getInitialProps = async ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    statusCode,
    errorId,
    error: process.env.NODE_ENV === 'development' ? err : null,
  };
};

export default Error;