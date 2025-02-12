'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  Typography
} from '@mui/material'; // @mui/material@5.14.0
import { Search as SearchIcon, FilterList as FilterIcon } from '@mui/icons-material'; // @mui/icons-material@5.14.0
import { useAuth0 } from '@auth0/auth0-react'; // @auth0/auth0-react@2.2.0
import * as Sentry from '@sentry/react'; // @sentry/react@7.0.0

import ApplicationStatus from '../../../components/application/ApplicationStatus';
import useApplications from '../../../hooks/useApplications';
import ErrorBoundary from '../../../components/common/ErrorBoundary';
import LoadingButton from '../../../components/common/LoadingButton';
import Toast from '../../../components/common/Toast';

import { Application, ApplicationStatus as AppStatus, VerificationStatus } from '../../../types/application';

// Enhanced security context for PII handling
const SecurityContext = React.createContext<{
  canViewPII: boolean;
  auditLog: (action: string) => void;
}>({
  canViewPII: false,
  auditLog: () => {},
});

// Filter options interface
interface FilterOptions {
  status?: AppStatus;
  verificationStatus?: VerificationStatus;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

const ApplicationsPage: React.FC = () => {
  // Auth state management
  const { user, isAuthenticated } = useAuth0();
  
  // Application data management with error handling
  const { 
    applications, 
    loading, 
    error,
    createApplication,
    submitApplication,
    uploadDocument,
    cancelOperation 
  } = useApplications();

  // Local state management
  const [filters, setFilters] = useState<FilterOptions>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [toastState, setToastState] = useState({
    open: false,
    message: '',
    severity: 'info' as 'success' | 'error' | 'warning' | 'info'
  });

  // Security context setup
  const securityContext = useMemo(() => ({
    canViewPII: isAuthenticated && user?.['https://api.rental.com/roles']?.includes('admin'),
    auditLog: (action: string) => {
      Sentry.addBreadcrumb({
        category: 'application',
        message: `User ${user?.sub} performed ${action}`,
        level: 'info'
      });
    }
  }), [isAuthenticated, user]);

  // Filter applications based on search and filters
  const filteredApplications = useMemo(() => {
    return applications?.filter((app: Application) => {
      const matchesSearch = searchTerm ? 
        app.id.toLowerCase().includes(searchTerm.toLowerCase()) :
        true;
      
      const matchesStatus = filters.status ? 
        app.status === filters.status :
        true;
        
      const matchesVerification = filters.verificationStatus ?
        app.verificationStatus === filters.verificationStatus :
        true;

      const matchesDateRange = filters.dateRange ?
        new Date(app.createdAt) >= filters.dateRange.start &&
        new Date(app.createdAt) <= filters.dateRange.end :
        true;

      return matchesSearch && matchesStatus && matchesVerification && matchesDateRange;
    });
  }, [applications, searchTerm, filters]);

  // Handle search input changes
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    securityContext.auditLog('SEARCH_APPLICATIONS');
  }, [securityContext]);

  // Handle filter changes
  const handleFilterChange = useCallback((filterKey: keyof FilterOptions, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
    securityContext.auditLog('FILTER_APPLICATIONS');
  }, [securityContext]);

  // Handle application submission
  const handleSubmitApplication = useCallback(async (applicationId: string) => {
    try {
      await submitApplication(applicationId);
      setToastState({
        open: true,
        message: 'Application submitted successfully',
        severity: 'success'
      });
      securityContext.auditLog('SUBMIT_APPLICATION');
    } catch (error) {
      setToastState({
        open: true,
        message: 'Failed to submit application',
        severity: 'error'
      });
      Sentry.captureException(error);
    }
  }, [submitApplication, securityContext]);

  // Error handling effect
  useEffect(() => {
    if (error) {
      setToastState({
        open: true,
        message: error,
        severity: 'error'
      });
    }
  }, [error]);

  return (
    <SecurityContext.Provider value={securityContext}>
      <ErrorBoundary
        showToast
        onError={(error) => {
          Sentry.captureException(error);
        }}
      >
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Rental Applications
            </Typography>
            
            {/* Search and Filter Section */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    )
                  }}
                  aria-label="Search applications"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Select
                  fullWidth
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  displayEmpty
                  aria-label="Filter by status"
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  {Object.values(AppStatus).map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </Grid>
            </Grid>

            {/* Applications Grid */}
            {loading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : filteredApplications?.length ? (
              <Grid container spacing={3}>
                {filteredApplications.map((application: Application) => (
                  <Grid item xs={12} md={6} lg={4} key={application.id}>
                    <Card>
                      <CardContent>
                        <ApplicationStatus
                          status={application.status}
                          verificationStatus={application.verificationStatus}
                          onWithdrawApplication={
                            application.status === AppStatus.SUBMITTED ?
                            () => cancelOperation() :
                            undefined
                          }
                          isLoading={loading}
                          ariaLabel={`Application ${application.id} status`}
                        />
                        {securityContext.canViewPII && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" color="textSecondary">
                              Applicant ID: {application.applicantId}
                            </Typography>
                          </Box>
                        )}
                        {application.status === AppStatus.DRAFT && (
                          <LoadingButton
                            fullWidth
                            variant="contained"
                            color="primary"
                            onClick={() => handleSubmitApplication(application.id)}
                            loading={loading}
                            sx={{ mt: 2 }}
                          >
                            Submit Application
                          </LoadingButton>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography variant="body1" color="textSecondary" align="center">
                No applications found
              </Typography>
            )}
          </Box>
        </Container>

        <Toast
          open={toastState.open}
          onClose={() => setToastState(prev => ({ ...prev, open: false }))}
          message={toastState.message}
          severity={toastState.severity}
          autoHideDuration={6000}
        />
      </ErrorBoundary>
    </SecurityContext.Provider>
  );
};

export default Sentry.withProfiler(ApplicationsPage);