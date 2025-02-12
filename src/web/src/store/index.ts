// @reduxjs/toolkit@1.9.5
// @react-redux@8.1.0
// @redux-encrypt@2.0.0
// @redux-logger@3.0.6
// @redux-persist@6.0.0

import { configureStore, combineReducers, Middleware } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { createEncryptionMiddleware } from 'redux-encrypt';
import { createLogger } from 'redux-logger';
import { persistStore, persistReducer, createTransform } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

// Import reducers from feature slices
import authReducer from './slices/authSlice';
import propertyReducer from './slices/propertySlice';
import applicationReducer from './slices/applicationSlice';

// Encryption configuration
const ENCRYPTION_KEY = process.env.REACT_APP_STATE_ENCRYPTION_KEY!;
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  secretKey: ENCRYPTION_KEY,
  onError: (error: Error) => {
    console.error('State encryption error:', error);
    // Reset to initial state on encryption error
    store.dispatch({ type: 'RESET_STATE' });
  }
};

// Create encryption middleware
const encryptionMiddleware = createEncryptionMiddleware(ENCRYPTION_CONFIG);

// Configure secure persistence transform
const encryptTransform = createTransform(
  // Transform state on its way to being serialized and persisted
  (inboundState: any) => {
    // Exclude sensitive data from persistence
    const { tokens, sessionExpiry, ...persistedState } = inboundState;
    return persistedState;
  },
  // Transform state being rehydrated
  (outboundState: any) => outboundState,
  // Apply only to auth state
  { whitelist: ['auth'] }
);

// Redux persist configuration
const persistConfig = {
  key: 'root',
  storage,
  transforms: [encryptTransform],
  whitelist: ['auth', 'property'], // Only persist non-sensitive slices
  blacklist: ['application'], // Don't persist application state
  writeFailHandler: (error: Error) => {
    console.error('State persistence error:', error);
  }
};

// Combine reducers with type safety
const rootReducer = combineReducers({
  auth: authReducer,
  property: propertyReducer,
  application: applicationReducer
});

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure development logging
const loggerMiddleware = createLogger({
  predicate: () => process.env.NODE_ENV === 'development',
  // Filter out sensitive data from logs
  filter: (getState, action) => {
    const sensitiveActions = ['auth/login', 'auth/refreshToken'];
    return !sensitiveActions.includes(action.type);
  },
  // Custom log formatting
  actionTransformer: (action) => ({
    ...action,
    type: `🔄 ${action.type}`
  }),
  // Collapse similar actions
  collapsed: true,
  duration: true
});

// Custom monitoring middleware
const monitoringMiddleware: Middleware = store => next => action => {
  const startTime = performance.now();
  const result = next(action);
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Log performance metrics for slow actions
  if (duration > 100) {
    console.warn(`Slow action detected: ${action.type} took ${duration.toFixed(2)}ms`);
  }

  return result;
};

// Configure store with security and monitoring features
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: {
      // Ignore non-serializable values in specific paths
      ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      ignoredPaths: ['auth.sessionExpiry']
    },
    thunk: {
      extraArgument: {
        // Add any extra dependencies for thunks
      }
    }
  }).concat(
    encryptionMiddleware,
    monitoringMiddleware,
    process.env.NODE_ENV === 'development' ? loggerMiddleware : []
  ),
  devTools: process.env.NODE_ENV === 'development',
  enhancers: []
});

// Create persistor
export const persistor = persistStore(store);

// Type definitions for enhanced type safety
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Custom hooks with type safety
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Export store instance for direct access when needed
export default store;