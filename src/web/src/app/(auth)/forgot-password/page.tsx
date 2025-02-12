'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Paper, Typography, CircularProgress } from '@mui/material';
import ForgotPasswordForm from '../../../components/auth/ForgotPasswordForm';
import SEO from '../../../components/common/SEO';
import useAuth from '../../../hooks/useAuth';

/**
 * Enhanced forgot password page component with comprehensive security features
 * Implements secure password reset flow with rate limiting and proper validation
 * @version 1.0.0
 */
const ForgotPasswordPage = () => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <Container 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh' 
        }}
      >
        <CircularProgress 
          size={40} 
          aria-label="Loading"
          role="progressbar"
        />
      </Container>
    );
  }

  // Handle successful password reset request
  const handleResetSuccess = () => {
    router.push('/auth/login?reset=requested');
  };

  return (
    <>
      <SEO
        title="Reset Password - Project X Rental Platform"
        description="Securely reset your password for Project X rental platform. We'll send you instructions to create a new password."
        canonical={`${process.env.NEXT_PUBLIC_BASE_URL}/auth/forgot-password`}
      />

      <Container 
        maxWidth="sm" 
        sx={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: 4
        }}
      >
        <Paper
          elevation={2}
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <Typography
            component="h1"
            variant="h4"
            align="center"
            gutterBottom
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              mb: 3
            }}
          >
            Reset Password
          </Typography>

          <Typography
            variant="body1"
            align="center"
            color="text.secondary"
            sx={{ mb: 4 }}
          >
            Enter your email address and we&apos;ll send you instructions to reset your password.
          </Typography>

          <ForgotPasswordForm
            onSuccess={handleResetSuccess}
            onError={(error) => {
              console.error('Password reset error:', error);
            }}
          />

          <Typography
            variant="body2"
            align="center"
            sx={{ 
              mt: 3,
              color: 'text.secondary'
            }}
          >
            Remember your password?{' '}
            <Typography
              component="a"
              href="/auth/login"
              variant="body2"
              sx={{
                color: 'primary.main',
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline'
                },
                '&:focus': {
                  outline: '2px solid',
                  outlineOffset: 2
                }
              }}
            >
              Sign in
            </Typography>
          </Typography>
        </Paper>
      </Container>
    </>
  );
};

export default ForgotPasswordPage;