// @version @testing-library/react-hooks@8.0.1
import { renderHook, act } from '@testing-library/react-hooks';
// @version @testing-library/react@14.0.0
import { act as reactAct } from '@testing-library/react';
// @version react-redux@8.1.0
import { Provider } from 'react-redux';
// @version @reduxjs/toolkit@1.9.5
import { configureStore } from '@reduxjs/toolkit';
// @version @testing-library/webauthn@1.0.0
import { mockWebAuthn } from '@testing-library/webauthn';

import { useAuth } from '../../hooks/useAuth';
import { User, SessionStatus } from '../../types/auth';
import authReducer, { 
  loginThunk, 
  verifyMFAThunk, 
  refreshTokenThunk 
} from '../../store/slices/authSlice';

describe('useAuth', () => {
  let mockStore: any;
  let wrapper: React.FC;

  beforeEach(() => {
    // Reset all mocks and storage
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Configure mock store with auth reducer
    mockStore = configureStore({
      reducer: {
        auth: authReducer
      }
    });

    // Configure test wrapper with Redux provider
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={mockStore}>{children}</Provider>
    );

    // Mock WebAuthn for biometric tests
    mockWebAuthn.initialize();
  });

  afterEach(() => {
    mockWebAuthn.reset();
  });

  it('should initialize with default unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBeFalsy();
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should handle successful login', async () => {
    const mockUser: User = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'RENTER',
      permissions: ['view_listings']
    };

    mockStore.dispatch = jest.fn().mockResolvedValueOnce({
      payload: {
        user: mockUser,
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh',
          expiresIn: 3600
        }
      }
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    expect(result.current.isAuthenticated).toBeTruthy();
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.error).toBeNull();
  });

  it('should handle MFA verification flow', async () => {
    mockStore.dispatch = jest.fn()
      .mockResolvedValueOnce({
        payload: {
          mfaRequired: true,
          email: 'test@example.com'
        }
      })
      .mockResolvedValueOnce({
        payload: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'RENTER'
          },
          tokens: {
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh',
            expiresIn: 3600
          }
        }
      });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initial login attempt
    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        mfaEnabled: true
      });
    });

    expect(result.current.mfaRequired).toBeTruthy();

    // MFA verification
    await act(async () => {
      await result.current.verifyMFA('123456');
    });

    expect(result.current.isAuthenticated).toBeTruthy();
    expect(result.current.mfaRequired).toBeFalsy();
  });

  it('should handle biometric authentication', async () => {
    const mockCredentials = {
      id: 'credential-id',
      type: 'public-key'
    };

    mockWebAuthn.setCredentials([mockCredentials]);

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Enable biometric auth
    await act(async () => {
      await result.current.toggleBiometric(true);
    });

    expect(result.current.biometricEnabled).toBeTruthy();
    expect(result.current.biometricAvailable).toBeTruthy();

    // Attempt biometric login
    await act(async () => {
      await result.current.loginWithBiometric();
    });

    expect(mockWebAuthn.getCredential).toHaveBeenCalled();
  });

  it('should handle progressive token refresh', async () => {
    jest.useFakeTimers();

    const mockTokens = {
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      expiresIn: 3600
    };

    mockStore.dispatch = jest.fn().mockResolvedValueOnce({
      payload: mockTokens
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Set initial session expiry
    await act(async () => {
      mockStore.dispatch({
        type: 'auth/setSessionExpiry',
        payload: Date.now() + 300000 // 5 minutes
      });
    });

    // Advance timer to trigger refresh
    act(() => {
      jest.advanceTimersByTime(240000); // 4 minutes
    });

    await act(async () => {
      await result.current.refreshToken();
    });

    expect(mockStore.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: refreshTokenThunk.pending.type
      })
    );

    jest.useRealTimers();
  });

  it('should sync session across tabs', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Simulate logout in another tab
    await act(async () => {
      const storageEvent = new StorageEvent('storage', {
        key: 'auth_logout',
        newValue: Date.now().toString()
      });
      window.dispatchEvent(storageEvent);
    });

    expect(result.current.isAuthenticated).toBeFalsy();
    expect(result.current.user).toBeNull();
  });

  it('should handle secure logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Set initial authenticated state
    await act(async () => {
      mockStore.dispatch({
        type: 'auth/setAuthenticated',
        payload: true
      });
    });

    // Perform logout
    await act(async () => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBeFalsy();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_logout')).toBeTruthy();
  });

  it('should monitor session activity', async () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Set initial authenticated state
    await act(async () => {
      mockStore.dispatch({
        type: 'auth/setAuthenticated',
        payload: true
      });
    });

    // Advance timer past inactivity timeout
    act(() => {
      jest.advanceTimersByTime(31 * 60000); // 31 minutes
    });

    expect(result.current.isAuthenticated).toBeFalsy();
    expect(localStorage.getItem('auth_logout')).toBeTruthy();

    jest.useRealTimers();
  });

  it('should handle authentication errors', async () => {
    mockStore.dispatch = jest.fn().mockRejectedValueOnce(
      new Error('Invalid credentials')
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      try {
        await result.current.login({
          email: 'test@example.com',
          password: 'wrong-password'
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Authentication failed');
      }
    });

    expect(result.current.isAuthenticated).toBeFalsy();
    expect(result.current.error).toBeTruthy();
  });
});