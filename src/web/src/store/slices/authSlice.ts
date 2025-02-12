import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Auth0Client } from '@auth0/auth0-spa-js';
import { AES, enc } from 'crypto-js';
import { 
  User, 
  AuthResponse, 
  LoginRequest, 
  AuthTokens, 
  UserRole,
  MFARequest 
} from '../../types/auth';

// @version @auth0/auth0-spa-js@2.1.0
const auth0Client = new Auth0Client({
  domain: process.env.REACT_APP_AUTH0_DOMAIN!,
  clientId: process.env.REACT_APP_AUTH0_CLIENT_ID!,
  cacheLocation: 'memory',
  useRefreshTokens: true
});

// Encryption key for state encryption
const STATE_ENCRYPTION_KEY = process.env.REACT_APP_STATE_ENCRYPTION_KEY!;

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mfaRequired: boolean;
  mfaPending: boolean;
  sessionExpiry: number | null;
  lastActivity: number;
  biometricEnabled: boolean;
}

const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  mfaRequired: false,
  mfaPending: false,
  sessionExpiry: null,
  lastActivity: Date.now(),
  biometricEnabled: false
};

// Secure token storage utility
const secureTokenStorage = {
  store: (tokens: AuthTokens) => {
    const encrypted = AES.encrypt(JSON.stringify(tokens), STATE_ENCRYPTION_KEY);
    sessionStorage.setItem('auth_tokens', encrypted.toString());
  },
  retrieve: (): AuthTokens | null => {
    const encrypted = sessionStorage.getItem('auth_tokens');
    if (!encrypted) return null;
    const decrypted = AES.decrypt(encrypted, STATE_ENCRYPTION_KEY);
    return JSON.parse(decrypted.toString(enc.Utf8));
  },
  clear: () => {
    sessionStorage.removeItem('auth_tokens');
  }
};

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      // Rate limiting check
      const lastAttempt = sessionStorage.getItem('last_login_attempt');
      if (lastAttempt && Date.now() - parseInt(lastAttempt) < 1000) {
        throw new Error('Too many login attempts. Please wait.');
      }
      sessionStorage.setItem('last_login_attempt', Date.now().toString());

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const authResponse: AuthResponse = await response.json();

      if (authResponse.requiresMFA) {
        return { mfaRequired: true, email: credentials.email };
      }

      // Secure token storage
      secureTokenStorage.store(authResponse.tokens);

      // Initialize token refresh cycle
      initializeTokenRefresh(authResponse.tokens.expiresIn);

      return authResponse;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const verifyMFAThunk = createAsyncThunk(
  'auth/verifyMFA',
  async (mfaRequest: MFARequest, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mfaRequest)
      });

      if (!response.ok) {
        throw new Error('MFA verification failed');
      }

      const authResponse: AuthResponse = await response.json();
      secureTokenStorage.store(authResponse.tokens);
      return authResponse;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const refreshTokenThunk = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const tokens = secureTokenStorage.retrieve();
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const newTokens: AuthTokens = await response.json();
      secureTokenStorage.store(newTokens);
      return newTokens;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

const initializeTokenRefresh = (expiresIn: number) => {
  const refreshBuffer = 5 * 60 * 1000; // 5 minutes before expiry
  const refreshTime = (expiresIn * 1000) - refreshBuffer;
  setTimeout(() => {
    store.dispatch(refreshTokenThunk());
  }, refreshTime);
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      secureTokenStorage.clear();
      return { ...initialState };
    },
    updateLastActivity: (state) => {
      state.lastActivity = Date.now();
    },
    setBiometricEnabled: (state, action: PayloadAction<boolean>) => {
      state.biometricEnabled = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        if (action.payload.mfaRequired) {
          state.mfaRequired = true;
          state.mfaPending = true;
        } else {
          state.user = action.payload.user;
          state.tokens = action.payload.tokens;
          state.isAuthenticated = true;
          state.sessionExpiry = Date.now() + (action.payload.tokens.expiresIn * 1000);
        }
        state.isLoading = false;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(verifyMFAThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyMFAThunk.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.tokens = action.payload.tokens;
        state.isAuthenticated = true;
        state.mfaRequired = false;
        state.mfaPending = false;
        state.sessionExpiry = Date.now() + (action.payload.tokens.expiresIn * 1000);
        state.isLoading = false;
      })
      .addCase(verifyMFAThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(refreshTokenThunk.fulfilled, (state, action) => {
        state.tokens = action.payload;
        state.sessionExpiry = Date.now() + (action.payload.expiresIn * 1000);
      })
      .addCase(refreshTokenThunk.rejected, (state) => {
        return { ...initialState };
      });
  }
});

// Selectors
export const selectAuthState = (state: { auth: AuthState }) => ({
  isAuthenticated: state.auth.isAuthenticated,
  user: state.auth.user,
  isLoading: state.auth.isLoading,
  error: state.auth.error,
  mfaRequired: state.auth.mfaRequired,
  mfaPending: state.auth.mfaPending,
  sessionExpiry: state.auth.sessionExpiry,
  biometricEnabled: state.auth.biometricEnabled
});

export const selectUserRole = (state: { auth: AuthState }): UserRole | null => 
  state.auth.user?.role || null;

export const { logout, updateLastActivity, setBiometricEnabled, clearError } = authSlice.actions;

export default authSlice.reducer;