import React, { useMemo } from 'react';
import { Box, Grid, Card, CardContent, Typography, Skeleton, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { Property, PropertyStatus } from '../../types/property';
import { Application, ApplicationStatus } from '../../types/application';
import { useProperties } from '../../hooks/useProperties';

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading: boolean;
  tooltipText?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, trend, loading, tooltipText }) => {
  if (loading) {
    return (
      <Card elevation={2}>
        <CardContent>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="80%" height={40} />
          {trend && <Skeleton variant="text" width="40%" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Tooltip title={tooltipText || ''} arrow placement="top">
      <Card elevation={2}>
        <CardContent>
          <Typography color="textSecondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" component="div">
            {value}
          </Typography>
          {trend && (
            <Box display="flex" alignItems="center" mt={1}>
              {trend.isPositive ? (
                <TrendingUp color="success" fontSize="small" />
              ) : (
                <TrendingDown color="error" fontSize="small" />
              )}
              <Typography
                variant="body2"
                color={trend.isPositive ? 'success.main' : 'error.main'}
                ml={0.5}
              >
                {trend.value}%
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Tooltip>
  );
};

interface PropertyStats {
  totalProperties: number;
  activeListings: number;
  totalRevenue: number;
  growthRate: number;
}

const calculatePropertyStats = (properties: Property[]): PropertyStats => {
  return useMemo(() => {
    const total = properties.length;
    const active = properties.filter(p => p.status === PropertyStatus.ACTIVE).length;
    
    // Calculate total monthly revenue
    const revenue = properties.reduce((sum, property) => {
      return sum + property.units.reduce((unitSum, unit) => unitSum + unit.monthlyRent, 0);
    }, 0);

    // Calculate month-over-month growth (mock data for demo)
    const growthRate = 8.5; // This would normally be calculated from historical data

    return {
      totalProperties: total,
      activeListings: active,
      totalRevenue: revenue,
      growthRate
    };
  }, [properties]);
};

interface ConversionStats {
  rate: number;
  trend: number;
}

const calculateConversionRate = (properties: Property[]): ConversionStats => {
  return useMemo(() => {
    // Get all applications across properties
    const applications = properties.flatMap(property =>
      property.units.flatMap(unit => unit.applications || [])
    ) as Application[];

    const totalApplications = applications.length;
    const approvedApplications = applications.filter(
      app => app.status === ApplicationStatus.APPROVED
    ).length;

    const rate = totalApplications > 0 
      ? (approvedApplications / totalApplications) * 100 
      : 0;

    // Calculate trend (mock data for demo)
    const trend = 5.2; // This would normally be calculated from historical data

    return {
      rate: Math.round(rate * 10) / 10,
      trend
    };
  }, [properties]);
};

export const Stats: React.FC = () => {
  const { properties, operationStates: { loading, error } } = useProperties();
  
  const propertyStats = calculatePropertyStats(properties);
  const conversionStats = calculateConversionRate(properties);

  return (
    <Box py={3}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Properties"
            value={propertyStats.totalProperties}
            trend={{
              value: propertyStats.growthRate,
              isPositive: propertyStats.growthRate > 0
            }}
            loading={loading}
            tooltipText="Total number of properties in the marketplace"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Listings"
            value={propertyStats.activeListings}
            trend={{
              value: 12.3, // Mock trend data
              isPositive: true
            }}
            loading={loading}
            tooltipText="Number of currently active property listings"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Conversion Rate"
            value={`${conversionStats.rate}%`}
            trend={{
              value: conversionStats.trend,
              isPositive: conversionStats.trend > 0
            }}
            loading={loading}
            tooltipText="Application to lease conversion rate"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Monthly Revenue"
            value={`$${(propertyStats.totalRevenue).toLocaleString()}`}
            trend={{
              value: 15.7, // Mock trend data
              isPositive: true
            }}
            loading={loading}
            tooltipText="Total monthly rental revenue across all properties"
          />
        </Grid>
      </Grid>
      
      {error && (
        <Typography color="error" mt={2}>
          Error loading statistics: {error}
        </Typography>
      )}
    </Box>
  );
};