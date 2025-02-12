import React, { useState, useEffect, useCallback } from 'react';
import { TextField, Alert, Box, Typography, FormControlLabel, Checkbox } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../hooks/useAuth';
import LoadingButton from '../common/LoadingButton';
import { authSchemas } from '../../utils/validation';
import { useRateLimit } from '@rentals/rate-limit'; // @version ^1.0.0

interface LoginFormProps {
  onSuccess?: () => void;
  redirectUrl?: string;
  enableBiometric?: boolean;
  enableMFA?: boolean;
  maxAttempts?: number;
}

interface LoginFormData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface MFAFormData {
  code: string;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  redirectUrl,
  enableBiometric = false,
  enableMFA = true,
  maxAttempts = 5
}) => {
  // State management
  const [showMFA, setShowMFA] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const { login, verifyMFA, verifyBiometric, loading, error } = useAuth();
  const { isRateLimited, incrementAttempts } = useRateLimit('login', maxAttempts);

  // Form validation setup
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(authSchemas.loginSchema)
  });

  const {
    register: registerMFA,
    handleSubmit: handleMFASubmit,
    formState: { errors: mfaErrors }
  } = useForm<MFAFormData>({
    resolver: zodResolver(authSchemas.mfaValidationSchema)
  });

  // Check biometric availability
  useEffect(() => {
    const checkBiometric = async () => {
      if (enableBiometric) {
        try {
          const result = await verifyBiometric();
          setBiometricAvailable(result);
        } catch (error) {
          setBiometricAvailable(false);
        }
      }
    };
    checkBiometric();
  }, [enableBiometric, verifyBiometric]);

  // Handle login submission with rate limiting
  const onLoginSubmit = useCallback(async (data: LoginFormData) => {
    if (isRateLimited) {
      return;
    }

    try {
      const result = await login({
        email: data.email,
        password: data.password,
        mfaEnabled: enableMFA
      });

      if (result?.mfaRequired) {
        setShowMFA(true);
      } else {
        onSuccess?.();
        if (redirectUrl) {
          window.location.href = redirectUrl;
        }
      }
    } catch (error) {
      incrementAttempts();
    }
  }, [isRateLimited, login, enableMFA, onSuccess, redirectUrl, incrementAttempts]);

  // Handle MFA verification
  const onMFASubmit = useCallback(async (data: MFAFormData) => {
    try {
      await verifyMFA(data.code);
      onSuccess?.();
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (error) {
      // Error handling managed by useAuth hook
    }
  }, [verifyMFA, onSuccess, redirectUrl]);

  // Handle biometric authentication
  const handleBiometricAuth = useCallback(async () => {
    try {
      await verifyBiometric();
      onSuccess?.();
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (error) {
      // Error handling managed by useAuth hook
    }
  }, [verifyBiometric, onSuccess, redirectUrl]);

  return (
    <Box component="form" sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isRateLimited && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Too many login attempts. Please try again later.
        </Alert>
      )}

      {!showMFA ? (
        // Login Form
        <>
          <Typography variant="h5" component="h1" gutterBottom>
            Sign In
          </Typography>

          <TextField
            {...registerLogin('email')}
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            error={!!loginErrors.email}
            helperText={loginErrors.email?.message}
            disabled={loading || isRateLimited}
            autoComplete="email"
            inputProps={{
              'aria-label': 'Email',
              autoCapitalize: 'none'
            }}
          />

          <TextField
            {...registerLogin('password')}
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            error={!!loginErrors.password}
            helperText={loginErrors.password?.message}
            disabled={loading || isRateLimited}
            autoComplete="current-password"
            inputProps={{
              'aria-label': 'Password'
            }}
          />

          <FormControlLabel
            control={
              <Checkbox
                {...registerLogin('rememberMe')}
                color="primary"
                disabled={loading || isRateLimited}
              />
            }
            label="Remember me"
          />

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <LoadingButton
              onClick={handleLoginSubmit(onLoginSubmit)}
              loading={loading}
              disabled={isRateLimited}
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              aria-label="Sign in"
            >
              Sign In
            </LoadingButton>

            {biometricAvailable && (
              <LoadingButton
                onClick={handleBiometricAuth}
                loading={loading}
                disabled={isRateLimited}
                variant="outlined"
                color="primary"
                size="large"
                aria-label="Use biometric authentication"
              >
                Use Biometric
              </LoadingButton>
            )}
          </Box>
        </>
      ) : (
        // MFA Verification Form
        <>
          <Typography variant="h5" component="h1" gutterBottom>
            Enter Verification Code
          </Typography>

          <TextField
            {...registerMFA('code')}
            label="Verification Code"
            type="text"
            fullWidth
            margin="normal"
            error={!!mfaErrors.code}
            helperText={mfaErrors.code?.message}
            disabled={loading}
            inputProps={{
              'aria-label': 'Verification code',
              maxLength: 6,
              inputMode: 'numeric',
              pattern: '[0-9]*'
            }}
            autoComplete="one-time-code"
          />

          <LoadingButton
            onClick={handleMFASubmit(onMFASubmit)}
            loading={loading}
            fullWidth
            variant="contained"
            color="primary"
            size="large"
            sx={{ mt: 2 }}
            aria-label="Verify code"
          >
            Verify
          </LoadingButton>
        </>
      )}
    </Box>
  );
};

export default LoginForm;