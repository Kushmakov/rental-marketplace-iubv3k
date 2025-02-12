'use client';

import React, { useEffect, useCallback } from 'react';
import { Container, Paper, Typography, CircularProgress, Alert } from '@mui/material'; // @version ^5.14.0
import { useRouter, useSearchParams } from 'next/navigation'; // @version ^13.0.0
import { track } from '@vercel/analytics'; // @version ^1.0.0

import LoginForm from '../../../components/auth/LoginForm';
import { useAuth } from '../../../hooks/useAuth';

/**
 * Enhanced login page component with comprehensive authentication handling
 * Implements OAuth 2.0 + JWT with MFA support and analytics tracking
 */
const LoginPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, error } = useAuth();

  // Get return URL from query params or default to dashboard
  const returnUrl = searchParams?.get('returnUrl') || '/dashboard';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

  /**
   * Handle successful login with analytics tracking
   */
  const handleLoginSuccess = useCallback(async () => {
    try {
      // Track successful login event
      track('login_success', {
        returnUrl,
        timestamp: new Date().toISOString()
      });

      // Navigate to return URL
      router.replace(returnUrl);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  }, [router, returnUrl]);

  /**
   * Handle login error with analytics tracking
   */
  const handleLoginError = useCallback((error: Error) => {
    track('login_error', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={48} thickness={4} />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          borderRadius: 2
        }}
      >
        <Typography 
          component="h1" 
          variant="h4" 
          gutterBottom
          sx={{ mb: 4, fontWeight: 600 }}
        >
          Welcome Back
        </Typography>

        {error && (
          <Alert 
            severity="error" 
            sx={{ width: '100%', mb: 3 }}
          >
            {error}
          </Alert>
        )}

        <LoginForm
          onSuccess={handleLoginSuccess}
          onError={handleLoginError}
          redirectUrl={returnUrl}
          enableBiometric={true}
          enableMFA={true}
          maxAttempts={5}
        />

        <Typography 
          variant="body2" 
          color="text.secondary" 
          align="center" 
          sx={{ mt: 3 }}
        >
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Typography>
      </Paper>
    </Container>
  );
};

export default LoginPage;