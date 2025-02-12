import React, { useState, useCallback } from 'react';
import { TextField, Alert, Box } from '@mui/material'; // @mui/material@5.14.0
import LoadingButton from '../common/LoadingButton';
import { requestPasswordReset } from '../../lib/api/auth';
import { validateEmail } from '../../utils/validation';

interface ForgotPasswordFormProps {
  onSuccess: () => void;
  onError?: (error: RequestPasswordResetError) => void;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = React.memo(({ onSuccess, onError }) => {
  // Form state management
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Email change handler with validation
  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
    // Clear previous errors when user starts typing
    if (emailError) {
      setEmailError('');
    }
    if (submitError) {
      setSubmitError('');
    }
  }, [emailError, submitError]);

  // Form submission handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset error states
    setEmailError('');
    setSubmitError('');
    
    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.errors[0]);
      return;
    }

    setIsLoading(true);

    try {
      await requestPasswordReset({ email });
      setSuccessMessage('Password reset instructions have been sent to your email');
      setEmail('');
      onSuccess();
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred while requesting password reset';
      setSubmitError(errorMessage);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [email, onSuccess, onError]);

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={{
        width: '100%',
        maxWidth: 400,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {/* Success message */}
      {successMessage && (
        <Alert 
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSuccessMessage('')}
        >
          {successMessage}
        </Alert>
      )}

      {/* Error message */}
      {submitError && (
        <Alert 
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setSubmitError('')}
        >
          {submitError}
        </Alert>
      )}

      {/* Email input field */}
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email Address"
        value={email}
        onChange={handleEmailChange}
        error={!!emailError}
        helperText={emailError}
        disabled={isLoading}
        fullWidth
        required
        autoComplete="email"
        autoFocus
        inputProps={{
          'aria-label': 'Email Address',
          'aria-describedby': emailError ? 'email-error' : undefined,
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            '&.Mui-focused fieldset': {
              borderWidth: 2,
            },
          },
        }}
      />

      {/* Submit button */}
      <LoadingButton
        type="submit"
        loading={isLoading}
        disabled={!email || isLoading}
        fullWidth
        size="large"
        variant="contained"
        color="primary"
        aria-label="Reset Password"
        sx={{
          mt: 2,
          height: 48,
          fontWeight: 600,
        }}
      >
        Reset Password
      </LoadingButton>
    </Box>
  );
});

// Display name for debugging
ForgotPasswordForm.displayName = 'ForgotPasswordForm';

export default ForgotPasswordForm;