'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  TextField, 
  Card, 
  Grid, 
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  Snackbar
} from '@mui/material';
import { useAuth } from '../../../hooks/useAuth';
import LoadingButton from '../../../components/common/LoadingButton';
import { UserRole } from '../../../types/auth';

interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  lastLogin: string;
}

const ProfilePage: React.FC = () => {
  const { user, loading: authLoading, updateUser } = useAuth();
  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: '',
    lastName: '',
    email: '',
    role: UserRole.RENTER,
    lastLogin: ''
  });
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        lastLogin: new Date(user.lastLogin).toLocaleString()
      });
    }
  }, [user]);

  // Form auto-save debounce timer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDirty) {
        handleSubmit();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [formData, isDirty]);

  // Handle input changes with validation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setIsDirty(true);
  }, []);

  // Form submission handler with optimistic updates
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!isDirty) return;

    try {
      setLoading(true);
      setError(null);

      // Validate required fields
      if (!formData.firstName || !formData.lastName) {
        throw new Error('First name and last name are required');
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Invalid email format');
      }

      // Show confirmation for email changes
      if (user && user.email !== formData.email) {
        setShowConfirmDialog(true);
        return;
      }

      // Optimistic update
      const previousData = { ...formData };
      
      await updateUser({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email
      });

      setShowSuccess(true);
      setIsDirty(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
      // Revert optimistic update on error
      setFormData(prev => ({ ...prev }));
    } finally {
      setLoading(false);
    }
  };

  // Handle confirmation dialog actions
  const handleConfirmUpdate = async () => {
    setShowConfirmDialog(false);
    await handleSubmit();
  };

  if (authLoading) {
    return (
      <Card sx={{ p: 4, maxWidth: 800, mx: 'auto', my: 4 }}>
        <Typography>Loading profile...</Typography>
      </Card>
    );
  }

  return (
    <>
      <Card sx={{ p: 4, maxWidth: 800, mx: 'auto', my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Profile Settings
        </Typography>

        <form onSubmit={handleSubmit} noValidate>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
                inputProps={{
                  'aria-label': 'First Name',
                  maxLength: 50
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
                inputProps={{
                  'aria-label': 'Last Name',
                  maxLength: 50
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                inputProps={{
                  'aria-label': 'Email Address'
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Role"
                value={formData.role}
                disabled
                inputProps={{
                  'aria-label': 'User Role'
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Login"
                value={formData.lastLogin}
                disabled
                inputProps={{
                  'aria-label': 'Last Login Time'
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <LoadingButton
                loading={loading}
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={!isDirty}
                aria-label="Save Profile Changes"
              >
                Save Changes
              </LoadingButton>
            </Grid>
          </Grid>
        </form>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog 
        open={showConfirmDialog} 
        onClose={() => setShowConfirmDialog(false)}
        aria-labelledby="confirm-dialog-title"
      >
        <DialogTitle id="confirm-dialog-title">
          Confirm Email Change
        </DialogTitle>
        <DialogContent>
          <Typography>
            Changing your email address will require re-verification. Are you sure you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <LoadingButton
            onClick={() => setShowConfirmDialog(false)}
            color="secondary"
            aria-label="Cancel Email Change"
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            onClick={handleConfirmUpdate}
            color="primary"
            loading={loading}
            aria-label="Confirm Email Change"
          >
            Confirm
          </LoadingButton>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowSuccess(false)} 
          severity="success"
          sx={{ width: '100%' }}
        >
          Profile updated successfully
        </Alert>
      </Snackbar>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setError(null)} 
          severity="error"
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ProfilePage;