'use client';

import React from 'react';
import { Container, Paper, Typography } from '@mui/material'; // @mui/material@5.14.0
import { useSearchParams, redirect } from 'next/navigation'; // @next/navigation@13.0.0
import ResetPasswordForm from '../../../components/auth/ResetPasswordForm';
import useAuth from '../../../hooks/useAuth';

/**
 * Password reset page component with enhanced security features
 * Implements secure password reset flow with token validation and user redirection
 */
const ResetPasswordPage: React.FC = () => {
  // Get reset token from URL parameters
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Get authentication state
  const { isAuthenticated, user } = useAuth();

  // Redirect authenticated users to home page
  if (isAuthenticated && user) {
    redirect('/');
  }

  // Validate token presence and format
  if (!token || !/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(token)) {
    return (
      <Container maxWidth="sm">
        <Paper 
          elevation={3} 
          sx={{ 
            p: 4, 
            mt: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Typography 
            variant="h5" 
            component="h1" 
            gutterBottom
            align="center"
            color="error"
          >
            Invalid or Missing Reset Token
          </Typography>
          <Typography 
            variant="body1" 
            align="center"
            color="text.secondary"
          >
            The password reset link is invalid or has expired. Please request a new password reset link.
          </Typography>
        </Paper>
      </Container>
    );
  }

  /**
   * Handles successful password reset
   * Redirects to login page with success message
   */
  const handleResetSuccess = () => {
    // Clear any existing auth tokens
    localStorage.removeItem('auth_tokens');
    sessionStorage.clear();
    
    // Redirect to login with success message
    redirect('/auth/login?reset=success');
  };

  /**
   * Handles password reset errors
   * Displays user-friendly error messages
   */
  const handleResetError = (error: Error) => {
    console.error('Password reset error:', error);
    // Error handling is managed by the ResetPasswordForm component
  };

  return (
    <Container maxWidth="sm">
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          mt: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Typography 
          variant="h5" 
          component="h1" 
          gutterBottom
          align="center"
          sx={{ mb: 3 }}
        >
          Reset Your Password
        </Typography>
        
        <Typography 
          variant="body2" 
          color="text.secondary" 
          align="center"
          sx={{ mb: 4 }}
        >
          Please enter your new password below. Make sure it meets all the security requirements.
        </Typography>

        <ResetPasswordForm
          token={token}
          onSuccess={handleResetSuccess}
          onError={handleResetError}
          enablePasswordStrength={true}
        />
      </Paper>
    </Container>
  );
};

export default ResetPasswordPage;