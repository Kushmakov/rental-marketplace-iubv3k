// @package axios@1.4.0
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { AuthTokens } from '../../types/auth';

// Global configuration constants
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

// Token refresh state management
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

/**
 * Creates and configures a custom Axios instance with enterprise-grade features
 * @returns Configured AxiosInstance
 */
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Client-Version': process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
    },
    withCredentials: true // Enable cookie handling for CSRF
  });

  setupInterceptors(instance);
  return instance;
};

/**
 * Configures comprehensive request and response interceptors
 * @param axiosInstance - The Axios instance to configure
 */
const setupInterceptors = (axiosInstance: AxiosInstance): void => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    async (config) => {
      return await handleAuthToken(config);
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      return handleApiError(error);
    }
  );
};

/**
 * Manages authentication tokens and headers
 * @param config - Axios request configuration
 * @returns Modified config with auth headers
 */
const handleAuthToken = async (config: AxiosRequestConfig): Promise<AxiosRequestConfig> => {
  if (!config.headers) {
    config.headers = {};
  }

  try {
    const tokens = getStoredTokens();
    if (!tokens) {
      return config;
    }

    if (isTokenExpired(tokens.accessToken)) {
      if (!isRefreshing) {
        isRefreshing = true;
        const newTokens = await refreshAuthTokens(tokens.refreshToken);
        isRefreshing = false;
        onTokenRefreshed(newTokens.accessToken);
      }

      return new Promise((resolve) => {
        refreshSubscribers.push((token: string) => {
          config.headers!.Authorization = `Bearer ${token}`;
          resolve(config);
        });
      });
    }

    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  } catch (error) {
    console.error('Error handling auth token:', error);
  }

  return config;
};

/**
 * Comprehensive API error handling with retry logic
 * @param error - Axios error object
 * @returns Rejected promise with formatted error
 */
const handleApiError = async (error: AxiosError): Promise<never> => {
  const originalRequest = error.config;
  
  // Handle 401 Unauthorized
  if (error.response?.status === 401 && originalRequest) {
    if (!isRefreshing) {
      try {
        const tokens = getStoredTokens();
        if (tokens) {
          isRefreshing = true;
          const newTokens = await refreshAuthTokens(tokens.refreshToken);
          isRefreshing = false;
          onTokenRefreshed(newTokens.accessToken);
          return axiosInstance(originalRequest);
        }
      } catch (refreshError) {
        clearTokens();
        window.location.href = '/auth/login';
      }
    }
    
    return new Promise((resolve) => {
      refreshSubscribers.push((token: string) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        resolve(axiosInstance(originalRequest));
      });
    });
  }

  // Handle rate limiting
  if (error.response?.status === 429) {
    const retryAfter = error.response.headers['retry-after'];
    if (retryAfter && originalRequest) {
      await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
      return axiosInstance(originalRequest);
    }
  }

  // Handle network errors with retry
  if (!error.response && originalRequest) {
    const retryCount = (originalRequest._retry || 0) + 1;
    if (retryCount <= MAX_RETRIES) {
      originalRequest._retry = retryCount;
      return new Promise(resolve => 
        setTimeout(() => resolve(axiosInstance(originalRequest)), 1000 * retryCount)
      );
    }
  }

  return Promise.reject(formatError(error));
};

/**
 * Formats API errors for consistent error handling
 * @param error - Axios error object
 * @returns Formatted error object
 */
const formatError = (error: AxiosError) => {
  return {
    status: error.response?.status || 500,
    code: error.response?.data?.code || 'UNKNOWN_ERROR',
    message: error.response?.data?.message || 'An unexpected error occurred',
    details: error.response?.data?.details || {},
    timestamp: new Date().toISOString()
  };
};

/**
 * Helper function to check if a token is expired
 * @param token - JWT token to check
 * @returns boolean indicating if token is expired
 */
const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

/**
 * Retrieves stored authentication tokens
 * @returns AuthTokens object or null
 */
const getStoredTokens = (): AuthTokens | null => {
  const tokens = localStorage.getItem('auth_tokens');
  return tokens ? JSON.parse(tokens) : null;
};

/**
 * Clears stored authentication tokens
 */
const clearTokens = (): void => {
  localStorage.removeItem('auth_tokens');
};

/**
 * Refreshes authentication tokens
 * @param refreshToken - Current refresh token
 * @returns Promise with new AuthTokens
 */
const refreshAuthTokens = async (refreshToken: string): Promise<AuthTokens> => {
  const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  const newTokens: AuthTokens = response.data;
  localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
  return newTokens;
};

/**
 * Notifies subscribers of token refresh
 * @param token - New access token
 */
const onTokenRefreshed = (token: string): void => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

// Create and export the configured Axios instance
const axiosInstance = createAxiosInstance();
export default axiosInstance;