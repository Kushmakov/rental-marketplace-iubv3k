'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SignupForm from '../../../components/auth/SignupForm';
import SEO from '../../../components/common/SEO';
import { useAuth } from '../../../hooks/useAuth';

/**
 * SignupPage component for user registration with enhanced security and validation
 * Implements OAuth 2.0 + JWT based authentication with role selection
 * @version 1.0.0
 */
const SignupPage = () => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  /**
   * Handle successful signup with secure navigation
   * @param {Object} registeredUser - The newly registered user data
   */
  const handleSignupSuccess = async () => {
    try {
      // Redirect to dashboard after successful registration
      await router.replace('/dashboard');
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  /**
   * Handle signup errors with user feedback
   * @param {Error} error - The error object from signup attempt
   */
  const handleSignupError = (error: string) => {
    console.error('Signup error:', error);
    // Error handling is managed by SignupForm component
  };

  // Show loading state while checking authentication
  if (isLoading) {
    return null; // Loading state handled by layout
  }

  return (
    <>
      <SEO
        title="Sign Up - Project X Rental Marketplace"
        description="Create your account to start your rental journey with Project X. Find your perfect home or list your properties."
        canonicalUrl={`${process.env.NEXT_PUBLIC_BASE_URL}/signup`}
      />

      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              Create Your Account
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Join Project X to find your perfect rental or list your properties
            </p>
          </div>

          <SignupForm
            onSuccess={handleSignupSuccess}
            onError={handleSignupError}
            enableMFA={true} // Enable MFA for enhanced security
          />

          <div className="mt-4 text-center text-sm">
            <p className="text-gray-600">
              Already have an account?{' '}
              <a
                href="/login"
                className="font-medium text-primary hover:text-primary-dark"
              >
                Sign in
              </a>
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

export default SignupPage;