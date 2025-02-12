'use client';

import React, { useCallback, useEffect } from 'react';
import { Grid, Box, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import { Analytics } from '@segment/analytics-next';
import { Stats } from '../../components/dashboard/Stats';
import { ActivityFeed } from '../../components/dashboard/ActivityFeed';
import { RecentProperties } from '../../components/dashboard/RecentProperties';
import { useAuth } from '../../hooks/useAuth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

// Initialize analytics
const analytics = new Analytics({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || ''
});

/**
 * Dashboard page component that provides an overview of rental marketplace activities
 * Implements real-time updates, responsive design, and optimized performance
 */
const Dashboard = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Track page view
  useEffect(() => {
    analytics.page('Dashboard', {
      userId: user?.id,
      role: user?.role
    });
  }, [user]);

  // Handle property details navigation
  const handleViewPropertyDetails = useCallback((propertyId: string) => {
    analytics.track('Property Details Viewed', {
      propertyId,
      userId: user?.id
    });
    router.push(`/properties/${propertyId}`);
  }, [router, user]);

  // Handle activity feed retry
  const handleRetry = useCallback(async (componentId: string) => {
    analytics.track('Component Retry', {
      componentId,
      userId: user?.id
    });
  }, [user]);

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h4" component="h1" gutterBottom>
              Dashboard
            </Typography>
          </Grid>
          {[...Array(4)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Box sx={{ height: 140, bgcolor: 'grey.100', borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <ErrorBoundary
      showToast
      fallbackMessage="Failed to load dashboard content"
      enableDevelopmentLogging
    >
      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {/* Header */}
          <Grid item xs={12}>
            <Typography 
              variant="h4" 
              component="h1" 
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              Welcome back, {user?.firstName}
            </Typography>
          </Grid>

          {/* Stats Overview */}
          <Grid item xs={12}>
            <Stats />
          </Grid>

          {/* Recent Properties */}
          <Grid item xs={12} md={8}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Recent Properties
              </Typography>
            </Box>
            <RecentProperties
              limit={6}
              onViewDetails={handleViewPropertyDetails}
              enableVirtualization
              errorConfig={{
                retryDelay: 3000,
                maxRetries: 3
              }}
            />
          </Grid>

          {/* Activity Feed */}
          <Grid item xs={12} md={4}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Recent Activity
              </Typography>
            </Box>
            <ActivityFeed
              limit={10}
              showLoadMore
              enablePullToRefresh
              onRetry={() => handleRetry('activity-feed')}
              retryConfig={{
                maxAttempts: 3,
                delay: 1000
              }}
            />
          </Grid>
        </Grid>
      </Box>
    </ErrorBoundary>
  );
};

// Export with error boundary wrapper
export default Dashboard;