'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Container, Grid, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';

// Internal component imports
import PaymentForm from '../../../components/payment/PaymentForm';
import PaymentHistory from '../../../components/payment/PaymentHistory';
import PaymentSummary from '../../../components/payment/PaymentSummary';

// Hooks and utilities
import { usePayments } from '../../../hooks/usePayments';
import { useAppSelector } from '../../../store';
import { selectUserRole } from '../../../store/slices/authSlice';

// Types
import { Payment, PaymentType, PaymentError } from '../../../types/payment';

const PaymentsPage: React.FC = () => {
  // State management
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>(PaymentType.RENT);
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Custom hooks
  const {
    currentPayment,
    paymentHistory,
    isProcessing,
    error,
    createPayment,
    getPaymentAnalytics,
    clearErrors
  } = usePayments();

  // Get user role for authorization
  const userRole = useAppSelector(selectUserRole);

  // Analytics tracking
  const analytics = getPaymentAnalytics();

  // Payment success handler
  const handlePaymentSuccess = useCallback(async (payment: Payment) => {
    try {
      // Update analytics and metrics
      getPaymentAnalytics();

      // Show success notification
      const message = `Payment of ${payment.amount} processed successfully`;
      console.log('Payment Success:', message);
    } catch (error) {
      console.error('Error handling payment success:', error);
    }
  }, [getPaymentAnalytics]);

  // Payment error handler
  const handlePaymentError = useCallback((error: PaymentError) => {
    console.error('Payment Error:', error);
    // Additional error handling logic here
  }, []);

  // Page change handler for payment history
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Error boundary fallback
  const ErrorFallback = ({ error, resetErrorBoundary }: { 
    error: Error; 
    resetErrorBoundary: () => void;
  }) => (
    <Alert 
      severity="error" 
      onClose={resetErrorBoundary}
      sx={{ mb: 2 }}
    >
      <Typography variant="h6">Error Loading Payments</Typography>
      <Typography>{error.message}</Typography>
    </Alert>
  );

  // Clear errors on unmount
  useEffect(() => {
    return () => {
      clearErrors();
    };
  }, [clearErrors]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={clearErrors}
      >
        {/* Page Header */}
        <Box mb={4}>
          <Typography variant="h4" component="h1" gutterBottom>
            Payments Dashboard
          </Typography>
          
          {/* Payment Analytics Summary */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="subtitle2" color="textSecondary">
                Success Rate
              </Typography>
              <Typography variant="h6">
                {analytics.successRate.toFixed(1)}%
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="subtitle2" color="textSecondary">
                Total Processed
              </Typography>
              <Typography variant="h6">
                {analytics.totalProcessed}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="subtitle2" color="textSecondary">
                Average Processing Time
              </Typography>
              <Typography variant="h6">
                {analytics.averageProcessingTime.toFixed(1)}s
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="subtitle2" color="textSecondary">
                Failure Rate
              </Typography>
              <Typography variant="h6">
                {analytics.failureRate.toFixed(1)}%
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* Main Content */}
        <Grid container spacing={4}>
          {/* Payment Form Section */}
          <Grid item xs={12} md={6}>
            <Typography variant="h5" gutterBottom>
              Make a Payment
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error.message}
              </Alert>
            )}
            <PaymentForm
              amount={1000} // Example amount
              paymentType={selectedPaymentType}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          </Grid>

          {/* Current Payment Summary */}
          <Grid item xs={12} md={6}>
            {isProcessing ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : currentPayment ? (
              <PaymentSummary
                payment={currentPayment}
                showDetails
              />
            ) : null}
          </Grid>

          {/* Payment History Section */}
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom>
              Payment History
            </Typography>
            <PaymentHistory
              userRole={userRole || 'RENTER'}
              maskingLevel="partial"
              enableAudit
              page={currentPage}
              pageSize={pageSize}
            />
          </Grid>
        </Grid>
      </ErrorBoundary>
    </Container>
  );
};

export default PaymentsPage;