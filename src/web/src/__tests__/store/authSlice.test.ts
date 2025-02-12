import { configureStore } from '@reduxjs/toolkit';
import { mock } from 'jest-mock-extended';
import reducer, {
  loginThunk,
  verifyMFAThunk,
  refreshTokenThunk,
  logout,
  updateLastActivity,
  setBiometricEnabled,
  clearError,
  selectAuthState,
  selectUserRole
} from '../../store/slices/authSlice';
import { User, UserRole, AuthResponse, AuthTokens } from '../../types/auth';

// @version jest-mock-extended@3.0.4

describe('authSlice', () => {
  // Test store setup with security middleware
  const setupTestStore = () => {
    return configureStore({
      reducer: { auth: reducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            ignoredActions: ['auth/login/fulfilled', 'auth/verifyMFA/fulfilled'],
            ignoredPaths: ['auth.user.lastLogin']
          }
        })
    });
  };

  // Mock user generator with security features
  const generateMockUser = (overrides?: Partial<User>): User => ({
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.RENTER,
    lastLogin: new Date(),
    ...overrides
  });

  // Mock tokens with expiry
  const generateMockTokens = (expiresIn: number = 3600): AuthTokens => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn
  });

  describe('Initial State', () => {
    it('should handle secure initial state', () => {
      const store = setupTestStore();
      const state = store.getState().auth;

      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBeFalsy();
      expect(state.isLoading).toBeFalsy();
      expect(state.error).toBeNull();
      expect(state.mfaRequired).toBeFalsy();
      expect(state.mfaPending).toBeFalsy();
      expect(state.sessionExpiry).toBeNull();
      expect(state.biometricEnabled).toBeFalsy();
    });
  });

  describe('Authentication Flow', () => {
    let store: ReturnType<typeof setupTestStore>;
    
    beforeEach(() => {
      store = setupTestStore();
      jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      jest.resetAllMocks();
      sessionStorage.clear();
    });

    it('should handle successful login without MFA', async () => {
      const mockUser = generateMockUser();
      const mockTokens = generateMockTokens();
      const mockResponse: AuthResponse = {
        user: mockUser,
        tokens: mockTokens,
        requiresMFA: false
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await store.dispatch(loginThunk({
        email: 'test@example.com',
        password: 'secure-password',
        mfaEnabled: false
      }));

      const state = store.getState().auth;
      expect(state.isAuthenticated).toBeTruthy();
      expect(state.user).toEqual(mockUser);
      expect(state.tokens).toEqual(mockTokens);
      expect(state.sessionExpiry).toBeDefined();
    });

    it('should handle MFA flow correctly', async () => {
      // Initial login with MFA required
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requiresMFA: true })
      });

      await store.dispatch(loginThunk({
        email: 'test@example.com',
        password: 'secure-password',
        mfaEnabled: true
      }));

      let state = store.getState().auth;
      expect(state.mfaRequired).toBeTruthy();
      expect(state.mfaPending).toBeTruthy();

      // MFA verification
      const mockUser = generateMockUser();
      const mockTokens = generateMockTokens();
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: mockUser, tokens: mockTokens })
      });

      await store.dispatch(verifyMFAThunk({
        email: 'test@example.com',
        code: '123456'
      }));

      state = store.getState().auth;
      expect(state.mfaRequired).toBeFalsy();
      expect(state.mfaPending).toBeFalsy();
      expect(state.isAuthenticated).toBeTruthy();
    });

    it('should handle token refresh', async () => {
      // Setup initial authenticated state
      const mockTokens = generateMockTokens();
      sessionStorage.setItem('auth_tokens', JSON.stringify(mockTokens));

      const newTokens = generateMockTokens(7200);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newTokens)
      });

      await store.dispatch(refreshTokenThunk());

      const state = store.getState().auth;
      expect(state.tokens).toEqual(newTokens);
      expect(state.sessionExpiry).toBeGreaterThan(Date.now());
    });

    it('should handle login rate limiting', async () => {
      sessionStorage.setItem('last_login_attempt', Date.now().toString());

      const result = await store.dispatch(loginThunk({
        email: 'test@example.com',
        password: 'secure-password',
        mfaEnabled: false
      }));

      expect(result.type).toBe(loginThunk.rejected.type);
      expect(store.getState().auth.error).toBe('Too many login attempts. Please wait.');
    });
  });

  describe('Security Features', () => {
    let store: ReturnType<typeof setupTestStore>;

    beforeEach(() => {
      store = setupTestStore();
    });

    it('should handle secure logout', () => {
      const mockUser = generateMockUser();
      const mockTokens = generateMockTokens();
      
      store.dispatch({
        type: loginThunk.fulfilled.type,
        payload: { user: mockUser, tokens: mockTokens }
      });

      store.dispatch(logout());
      
      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBeFalsy();
      expect(sessionStorage.getItem('auth_tokens')).toBeNull();
    });

    it('should track user activity', () => {
      const initialTime = store.getState().auth.lastActivity;
      jest.advanceTimersByTime(1000);
      
      store.dispatch(updateLastActivity());
      
      const newTime = store.getState().auth.lastActivity;
      expect(newTime).toBeGreaterThan(initialTime);
    });

    it('should manage biometric authentication settings', () => {
      store.dispatch(setBiometricEnabled(true));
      expect(store.getState().auth.biometricEnabled).toBeTruthy();

      store.dispatch(setBiometricEnabled(false));
      expect(store.getState().auth.biometricEnabled).toBeFalsy();
    });
  });

  describe('Selectors', () => {
    let store: ReturnType<typeof setupTestStore>;

    beforeEach(() => {
      store = setupTestStore();
    });

    it('should select auth state correctly', () => {
      const mockUser = generateMockUser();
      store.dispatch({
        type: loginThunk.fulfilled.type,
        payload: { user: mockUser, tokens: generateMockTokens() }
      });

      const authState = selectAuthState(store.getState());
      expect(authState.isAuthenticated).toBeTruthy();
      expect(authState.user).toEqual(mockUser);
    });

    it('should select user role correctly', () => {
      const mockUser = generateMockUser({ role: UserRole.ADMIN });
      store.dispatch({
        type: loginThunk.fulfilled.type,
        payload: { user: mockUser, tokens: generateMockTokens() }
      });

      const role = selectUserRole(store.getState());
      expect(role).toBe(UserRole.ADMIN);
    });
  });

  describe('Error Handling', () => {
    let store: ReturnType<typeof setupTestStore>;

    beforeEach(() => {
      store = setupTestStore();
    });

    it('should handle authentication errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      });

      await store.dispatch(loginThunk({
        email: 'test@example.com',
        password: 'wrong-password',
        mfaEnabled: false
      }));

      const state = store.getState().auth;
      expect(state.error).toBe('Authentication failed');
      expect(state.isAuthenticated).toBeFalsy();
    });

    it('should clear authentication errors', () => {
      store.dispatch({
        type: loginThunk.rejected.type,
        payload: 'Test error'
      });

      expect(store.getState().auth.error).toBe('Test error');

      store.dispatch(clearError());
      expect(store.getState().auth.error).toBeNull();
    });
  });
});