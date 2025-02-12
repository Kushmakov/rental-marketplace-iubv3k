import React, { useCallback, useState } from 'react';
import { TextField, Box, Typography, FormControlLabel, Checkbox, Alert } from '@mui/material';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../hooks/useAuth';
import LoadingButton from '../common/LoadingButton';
import { UserRole } from '../../types/auth';

// Form validation schema with enhanced password rules
const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  role: z.nativeEnum(UserRole),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

type FormData = z.infer<typeof signupSchema>;

interface SignupFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  enableMFA?: boolean;
}

export const SignupForm: React.FC<SignupFormProps> = ({
  onSuccess,
  onError,
  enableMFA = false
}) => {
  const { signup, loading, error } = useAuth();
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange'
  });

  // Calculate password strength
  const calculatePasswordStrength = useCallback((password: string): number => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.match(/[A-Z]/)) score++;
    if (password.match(/[0-9]/)) score++;
    if (password.match(/[^A-Za-z0-9]/)) score++;
    if (password.length >= 12) score++;
    return (score / 5) * 100;
  }, []);

  // Watch password field for strength calculation
  const password = watch('password');
  React.useEffect(() => {
    if (password) {
      setPasswordStrength(calculatePasswordStrength(password));
    }
  }, [password, calculatePasswordStrength]);

  const onSubmit = async (data: FormData) => {
    try {
      await signup({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        mfaEnabled: enableMFA
      });
      onSuccess?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Signup failed');
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ mt: 1 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField
            {...register('firstName')}
            label="First Name"
            error={!!errors.firstName}
            helperText={errors.firstName?.message}
            fullWidth
            autoFocus
          />
          <TextField
            {...register('lastName')}
            label="Last Name"
            error={!!errors.lastName}
            helperText={errors.lastName?.message}
            fullWidth
          />
        </Box>

        <TextField
          {...register('email')}
          label="Email Address"
          type="email"
          error={!!errors.email}
          helperText={errors.email?.message}
          fullWidth
          autoComplete="email"
        />

        <TextField
          {...register('password')}
          label="Password"
          type={showPassword ? 'text' : 'password'}
          error={!!errors.password}
          helperText={
            <>
              {errors.password?.message}
              {password && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="textSecondary">
                    Password strength: {passwordStrength}%
                  </Typography>
                  <Box
                    sx={{
                      height: 4,
                      bgcolor: 'grey.200',
                      borderRadius: 1,
                      mt: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        borderRadius: 1,
                        width: `${passwordStrength}%`,
                        bgcolor: passwordStrength > 80 ? 'success.main' :
                          passwordStrength > 60 ? 'warning.main' : 'error.main',
                        transition: 'width 0.3s ease-in-out',
                      }}
                    />
                  </Box>
                </Box>
              )}
            </>
          }
          fullWidth
        />

        <TextField
          {...register('confirmPassword')}
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword?.message}
          fullWidth
        />

        <FormControlLabel
          control={
            <Checkbox
              {...register('acceptTerms')}
              color="primary"
            />
          }
          label="I accept the terms and conditions"
        />
        {errors.acceptTerms && (
          <Typography color="error" variant="caption">
            {errors.acceptTerms.message}
          </Typography>
        )}

        <LoadingButton
          type="submit"
          fullWidth
          variant="contained"
          loading={loading}
          disabled={loading}
          size="large"
          sx={{ mt: 2 }}
        >
          Sign Up
        </LoadingButton>
      </Box>
    </Box>
  );
};

export default SignupForm;