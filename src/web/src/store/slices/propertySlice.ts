// @package @reduxjs/toolkit@1.9.5

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Property, PropertyStatus, PropertySearchFilters } from '../../types/property';
import { searchProperties } from '../../lib/api/properties';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Debounce delay for search requests (300ms)
const SEARCH_DEBOUNCE = 300;

/**
 * Interface defining the property slice state shape
 */
interface PropertyState {
  properties: Property[];
  selectedProperty: Property | null;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  filters: PropertySearchFilters;
  cache: Record<string, {
    data: Property[];
    timestamp: number;
  }>;
  pendingRequests: Record<string, AbortController>;
}

/**
 * Initial state for the property slice
 */
const initialState: PropertyState = {
  properties: [],
  selectedProperty: null,
  loading: {},
  error: {},
  filters: {},
  cache: {},
  pendingRequests: {}
};

/**
 * Async thunk for searching properties with debouncing and cancellation support
 */
export const searchPropertiesAsync = createAsyncThunk(
  'property/search',
  async (filters: PropertySearchFilters, { getState, signal }) => {
    const state = getState() as { property: PropertyState };
    
    // Cancel any existing search request
    if (state.property.pendingRequests['search']) {
      state.property.pendingRequests['search'].abort();
    }

    // Check cache validity
    const cacheKey = JSON.stringify(filters);
    const cachedData = state.property.cache[cacheKey];
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      return cachedData.data;
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    
    try {
      // Debounce the search request
      await new Promise(resolve => setTimeout(resolve, SEARCH_DEBOUNCE));
      
      // Perform the search with cancellation support
      const properties = await searchProperties(filters, controller.signal);
      
      // Update cache
      return properties;
    } finally {
      // Cleanup controller
      delete state.property.pendingRequests['search'];
    }
  }
);

/**
 * Property slice with reducers and actions
 */
export const propertySlice = createSlice({
  name: 'property',
  initialState,
  reducers: {
    setSelectedProperty: (state, action: PayloadAction<Property | null>) => {
      state.selectedProperty = action.payload;
    },
    updatePropertyStatus: (state, action: PayloadAction<{ id: string; status: PropertyStatus }>) => {
      const property = state.properties.find(p => p.id === action.payload.id);
      if (property) {
        property.status = action.payload.status;
      }
      if (state.selectedProperty?.id === action.payload.id) {
        state.selectedProperty.status = action.payload.status;
      }
    },
    setFilters: (state, action: PayloadAction<PropertySearchFilters>) => {
      state.filters = action.payload;
    },
    clearCache: (state) => {
      state.cache = {};
    },
    clearErrors: (state) => {
      state.error = {};
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchPropertiesAsync.pending, (state) => {
        state.loading['search'] = true;
        state.error['search'] = null;
      })
      .addCase(searchPropertiesAsync.fulfilled, (state, action) => {
        state.loading['search'] = false;
        state.properties = action.payload;
        
        // Update cache
        const cacheKey = JSON.stringify(state.filters);
        state.cache[cacheKey] = {
          data: action.payload,
          timestamp: Date.now()
        };
      })
      .addCase(searchPropertiesAsync.rejected, (state, action) => {
        state.loading['search'] = false;
        state.error['search'] = action.error.message || 'Failed to search properties';
      });
  }
});

// Export actions
export const {
  setSelectedProperty,
  updatePropertyStatus,
  setFilters,
  clearCache,
  clearErrors
} = propertySlice.actions;

// Memoized selectors
export const selectProperties = (state: { property: PropertyState }) => state.property.properties;
export const selectSelectedProperty = (state: { property: PropertyState }) => state.property.selectedProperty;
export const selectPropertyFilters = (state: { property: PropertyState }) => state.property.filters;
export const selectPropertyLoadingState = (state: { property: PropertyState }, operation: string) => 
  state.property.loading[operation] || false;
export const selectPropertyError = (state: { property: PropertyState }, operation: string) => 
  state.property.error[operation] || null;

// Export reducer
export default propertySlice.reducer;