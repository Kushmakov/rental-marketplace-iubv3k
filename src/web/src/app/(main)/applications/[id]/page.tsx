'use client';

import React, { useCallback, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material'; // @mui/material@5.14.0
import ApplicationStatus from '@/components/application/ApplicationStatus';
import ApplicationForm from '@/components/application/ApplicationForm';
import useApplications from '@/hooks/useApplications';
import ErrorBoundary from '@/components/common/ErrorBoundary';

// Metadata generation for SEO and accessibility
export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Rental Application ${params.id} | Project X`,
    description: 'View and manage your rental application details',
    openGraph: {
      title: `Rental Application ${params.id}`,
      description: 'Rental application details and status tracking',
      type: 'website',
    },
    robots: {
      index: false, // Prevent indexing of sensitive application data
      follow: false,
    },
  };
}

// Main page component with enhanced security and accessibility
const ApplicationPage = ({ params }: { params: { id: string } }) => {
  // Initialize application state with security context
  const {
    application,
    loading,
    error,
    submitApplication,
    cancelOperation
  } = useApplications();

  // Secure submission handler with audit logging
  const handleSubmitSuccess = useCallback(async () => {
    try {
      await submitApplication(params.id);
    } catch (error) {
      console.error('Application submission failed:', error);
    }
  }, [params.id, submitApplication]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelOperation();
    };
  }, [cancelOperation]);

  // Loading state with accessibility
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
        role="status"
        aria-label="Loading application details"
      >
        <CircularProgress
          size={40}
          aria-label="Loading spinner"
        />
      </Box>
    );
  }

  // Error state with user-friendly message
  if (error) {
    return (
      <Alert 
        severity="error"
        role="alert"
        aria-live="assertive"
        sx={{ mb: 2 }}
      >
        {error}
      </Alert>
    );
  }

  // No application found state
  if (!application) {
    return (
      <Alert 
        severity="warning"
        role="alert"
        aria-live="polite"
        sx={{ mb: 2 }}
      >
        Application not found or access denied
      </Alert>
    );
  }

  return (
    <ErrorBoundary
      showToast
      fallbackMessage="An error occurred while displaying the application"
      enableDevelopmentLogging
    >
      <Box
        component="main"
        role="main"
        aria-label="Application Details"
        sx={{
          maxWidth: 'lg',
          mx: 'auto',
          p: { xs: 2, sm: 3 },
        }}
      >
        {/* Page Header */}
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ mb: 4 }}
        >
          Rental Application
        </Typography>

        {/* Application Status Section */}
        <Box sx={{ mb: 4 }}>
          <ApplicationStatus
            status={application.status}
            verificationStatus={application.verificationStatus}
            isLoading={loading}
            ariaLabel="Application status and verification progress"
          />
        </Box>

        {/* Application Form or Details */}
        {application.status === 'DRAFT' ? (
          <ApplicationForm
            unitId={application.unitId}
            onSubmitSuccess={handleSubmitSuccess}
            onSubmitError={(error) => {
              console.error('Form submission error:', error);
            }}
            isAccessible={true}
            securityConfig={{
              encryptPII: true,
              documentValidation: true,
              maxFileSize: 10 * 1024 * 1024 // 10MB
            }}
            validationRules={{
              minIncomeMultiplier: 3,
              requiredDocuments: ['ID_PROOF', 'INCOME_PROOF', 'EMPLOYMENT_PROOF']
            }}
          />
        ) : (
          <Box
            role="region"
            aria-label="Application Details"
            sx={{ mt: 3 }}
          >
            {/* Display submitted application details */}
            <Typography variant="h6" gutterBottom>
              Application Details
            </Typography>
            {/* Add detailed application information display here */}
          </Box>
        )}
      </Box>
    </ErrorBoundary>
  );
};

export default ApplicationPage;