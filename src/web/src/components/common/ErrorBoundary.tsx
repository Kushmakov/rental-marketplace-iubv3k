import React from 'react'; // ^18.2.0
import { Box, Typography, Button } from '@mui/material'; // ^5.14.0
import Toast from './Toast';

// Props interface for ErrorBoundary component
interface ErrorBoundaryProps {
  children: React.ReactNode;
  showToast?: boolean;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  fallbackMessage?: string;
  enableDevelopmentLogging?: boolean;
}

// State interface for error tracking
interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: string | null;
  showErrorToast: boolean;
  errorId: string;
  errorTimestamp: number;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      errorInfo: null,
      showErrorToast: false,
      errorId: '',
      errorTimestamp: 0,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      error,
      errorInfo: error.stack || null,
      showErrorToast: true,
      errorId,
      errorTimestamp: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Development mode logging
    if (process.env.NODE_ENV === 'development' && this.props.enableDevelopmentLogging) {
      console.group('Error Boundary Caught Error:');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.groupEnd();
    }

    // Sanitize error for production logging
    const sanitizedError = {
      message: error.message,
      name: error.name,
      errorId: this.state.errorId,
      timestamp: this.state.errorTimestamp,
      componentStack: errorInfo.componentStack,
    };

    // Call error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error information
    this.setState({
      errorInfo: errorInfo.componentStack || null,
    });
  }

  handleToastClose = (): void => {
    this.setState({
      showErrorToast: false,
    });
  };

  handleRetry = (): void => {
    this.setState({
      error: null,
      errorInfo: null,
      showErrorToast: false,
      errorId: '',
      errorTimestamp: 0,
    });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      const fallbackMessage = this.props.fallbackMessage || 'Something went wrong. Please try again.';
      
      return (
        <Box
          role="alert"
          aria-live="polite"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="200px"
          p={3}
          textAlign="center"
        >
          <Typography
            variant="h5"
            component="h2"
            gutterBottom
            color="error"
            aria-label="Error message"
          >
            {fallbackMessage}
          </Typography>
          
          {process.env.NODE_ENV === 'development' && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ mb: 2, maxWidth: '600px', overflow: 'auto' }}
            >
              <pre style={{ margin: 0, textAlign: 'left' }}>
                {this.state.error.toString()}
                {this.state.errorInfo}
              </pre>
            </Typography>
          )}

          <Button
            variant="contained"
            color="primary"
            onClick={this.handleRetry}
            aria-label="Retry"
            sx={{ mt: 2 }}
          >
            Try Again
          </Button>

          {this.props.showToast && (
            <Toast
              open={this.state.showErrorToast}
              onClose={this.handleToastClose}
              message={fallbackMessage}
              severity="error"
              autoHideDuration={6000}
              role="alert"
              ariaLabel="Error notification"
            />
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;