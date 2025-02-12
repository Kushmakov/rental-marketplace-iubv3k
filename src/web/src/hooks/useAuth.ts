// @version react-redux@8.1.0
import { useDispatch, useSelector } from 'react-redux';
// @version @react-native-community/biometrics@2.1.0
import { useBiometric } from '@react-native-community/biometrics';
import { User } from '../../types/auth';
import { 
  authSlice, 
  loginThunk, 
  verifyMFAThunk, 
  refreshTokenThunk,
  selectAuthState,
  selectUserRole,
  logout,
  updateLastActivity,
  setBiometricEnabled
} from '../../store/slices/authSlice';

// Constants for session management
const SESSION_CHECK_INTERVAL = 60000; // 1 minute
const INACTIVITY_TIMEOUT = 30 * 60000; // 30 minutes
const TOKEN_REFRESH_THRESHOLD = 5 * 60000; // 5 minutes before expiry

/**
 * Enhanced authentication hook with advanced security features
 * Implements OAuth 2.0 + JWT with MFA, biometric auth, and session synchronization
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const authState = useSelector(selectAuthState);
  const userRole = useSelector(selectUserRole);
  const biometric = useBiometric();

  /**
   * Handles cross-tab session synchronization
   */
  const syncSession = () => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_logout') {
        dispatch(logout());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  };

  /**
   * Progressive token refresh implementation
   */
  const refreshToken = async (): Promise<void> => {
    if (!authState.sessionExpiry) return;

    const timeUntilExpiry = authState.sessionExpiry - Date.now();
    if (timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD) {
      try {
        await dispatch(refreshTokenThunk()).unwrap();
      } catch (error) {
        dispatch(logout());
        localStorage.setItem('auth_logout', Date.now().toString());
      }
    }
  };

  /**
   * Session activity monitoring
   */
  const monitorSession = () => {
    const checkSession = () => {
      const inactivityPeriod = Date.now() - authState.lastActivity;
      if (inactivityPeriod >= INACTIVITY_TIMEOUT) {
        dispatch(logout());
        localStorage.setItem('auth_logout', Date.now().toString());
        return;
      }
      dispatch(updateLastActivity());
    };

    const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  };

  /**
   * Enhanced login handler with MFA and biometric support
   */
  const login = async (credentials: {
    email: string;
    password: string;
    mfaEnabled?: boolean;
  }): Promise<void> => {
    try {
      const result = await dispatch(loginThunk(credentials)).unwrap();
      
      if (result.mfaRequired) {
        // MFA verification pending
        return;
      }

      // Initialize session monitoring
      monitorSession();
      syncSession();
    } catch (error) {
      throw new Error('Authentication failed');
    }
  };

  /**
   * Biometric authentication handler
   */
  const loginWithBiometric = async (): Promise<void> => {
    if (!authState.biometricEnabled) {
      throw new Error('Biometric authentication not enabled');
    }

    try {
      const biometricAuth = await biometric.simplePrompt({
        promptMessage: 'Authenticate to continue',
        cancelButtonText: 'Cancel'
      });

      if (biometricAuth.success) {
        // Retrieve stored credentials and login
        const storedCredentials = await retrieveSecureCredentials();
        if (storedCredentials) {
          await login(storedCredentials);
        }
      }
    } catch (error) {
      throw new Error('Biometric authentication failed');
    }
  };

  /**
   * MFA verification handler
   */
  const verifyMFA = async (code: string): Promise<void> => {
    if (!authState.mfaPending) {
      throw new Error('No MFA verification pending');
    }

    try {
      await dispatch(verifyMFAThunk({ 
        email: authState.user?.email || '', 
        code 
      })).unwrap();
    } catch (error) {
      throw new Error('MFA verification failed');
    }
  };

  /**
   * Secure logout handler with cross-tab synchronization
   */
  const handleLogout = () => {
    dispatch(logout());
    localStorage.setItem('auth_logout', Date.now().toString());
  };

  /**
   * Enable/disable biometric authentication
   */
  const toggleBiometric = async (enable: boolean): Promise<void> => {
    if (enable) {
      const biometricAvailable = await biometric.isSensorAvailable();
      if (!biometricAvailable) {
        throw new Error('Biometric authentication not available');
      }
    }
    dispatch(setBiometricEnabled(enable));
  };

  /**
   * Retrieve securely stored credentials for biometric auth
   */
  const retrieveSecureCredentials = async () => {
    // Implementation would depend on platform-specific secure storage
    // This is a placeholder for the actual implementation
    return null;
  };

  return {
    // Authentication state
    user: authState.user as User | null,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: authState.error,
    userRole,
    
    // MFA state
    mfaRequired: authState.mfaRequired,
    mfaPending: authState.mfaPending,
    
    // Biometric state
    biometricEnabled: authState.biometricEnabled,
    biometricAvailable: biometric.isSensorAvailable(),
    
    // Session state
    sessionExpiry: authState.sessionExpiry,
    
    // Authentication methods
    login,
    loginWithBiometric,
    verifyMFA,
    logout: handleLogout,
    toggleBiometric,
    refreshToken
  };
};

export default useAuth;