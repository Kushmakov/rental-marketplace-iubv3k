import React, { useState, useCallback } from 'react';
import { TextField, Alert, Box, Typography } from '@mui/material'; // @mui/material@5.14.0
import { useForm } from 'react-hook-form'; // @hookform/resolvers@3.3.0
import { zodResolver } from '@hookform/resolvers/zod'; // @hookform/resolvers@3.3.0
import LoadingButton from '../common/LoadingButton';
import { resetPassword } from '../../lib/api/auth';
import { authSchemas } from '../../utils/validation';

// Interface for form props
interface ResetPasswordFormProps {
  token: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  enablePasswordStrength?: boolean;
}

// Interface for form data
interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

/**
 * Enhanced password reset form component with comprehensive security features
 * and accessibility support following Material Design 3.0 guidelines
 */
const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
  token,
  onSuccess,
  onError,
  enablePasswordStrength = true
}) => {
  // Form state management
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');

  // Initialize form with validation schema
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid }
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(authSchemas.signupSchema),
    mode: 'onChange'
  });

  // Watch password field for strength indicator
  const password = watch('password');

  // Calculate password strength
  React.useEffect(() => {
    if (enablePasswordStrength && password) {
      let strength: 'weak' | 'medium' | 'strong' = 'weak';
      const hasLength = password.length >= 8;
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*]/.test(password);
      
      const score = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial]
        .filter(Boolean).length;
      
      if (score >= 5) strength = 'strong';
      else if (score >= 3) strength = 'medium';
      
      setPasswordStrength(strength);
    }
  }, [password, enablePasswordStrength]);

  // Handle form submission
  const onSubmit = useCallback(async (data: ResetPasswordFormData) => {
    setLoading(true);
    setError(null);

    try {
      await resetPassword({
        token,
        newPassword: data.password
      });

      // Clear sensitive data
      data.password = '';
      data.confirmPassword = '';

      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Password reset failed';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [token, onSuccess, onError]);

  // Get strength indicator color
  const getStrengthColor = () => {
    switch (passwordStrength) {
      case 'strong':
        return 'success.main';
      case 'medium':
        return 'warning.main';
      default:
        return 'error.main';
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      sx={{ width: '100%', maxWidth: 400 }}
    >
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          role="alert"
        >
          {error}
        </Alert>
      )}

      <TextField
        {...register('password')}
        variant="outlined"
        margin="normal"
        required
        fullWidth
        name="password"
        label="New Password"
        type="password"
        id="password"
        autoComplete="new-password"
        error={!!errors.password}
        helperText={errors.password?.message}
        inputProps={{
          'aria-label': 'New password',
          'aria-describedby': 'password-requirements'
        }}
      />

      {enablePasswordStrength && (
        <Typography
          variant="caption"
          color={getStrengthColor()}
          id="password-strength"
          sx={{ mb: 2, display: 'block' }}
        >
          Password strength: {passwordStrength}
        </Typography>
      )}

      <TextField
        {...register('confirmPassword')}
        variant="outlined"
        margin="normal"
        required
        fullWidth
        name="confirmPassword"
        label="Confirm Password"
        type="password"
        id="confirmPassword"
        autoComplete="new-password"
        error={!!errors.confirmPassword}
        helperText={errors.confirmPassword?.message}
        inputProps={{
          'aria-label': 'Confirm password',
          'aria-describedby': 'password-match'
        }}
      />

      <Typography
        variant="caption"
        color="text.secondary"
        id="password-requirements"
        sx={{ mb: 2, display: 'block' }}
      >
        Password must contain at least 8 characters, including uppercase, lowercase,
        numbers, and special characters.
      </Typography>

      <LoadingButton
        type="submit"
        fullWidth
        variant="contained"
        color="primary"
        loading={loading}
        disabled={!isValid || loading}
        sx={{ mt: 2 }}
        aria-label="Reset password"
      >
        Reset Password
      </LoadingButton>
    </Box>
  );
};

export default ResetPasswordForm;