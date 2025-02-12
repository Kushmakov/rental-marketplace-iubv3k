// @package react-redux@8.1.0
// @package use-debounce@9.0.0

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useDebounce } from 'use-debounce';
import { 
  Property, 
  PropertyStatus, 
  PropertySearchFilters 
} from '../../types/property';
import { 
  searchPropertiesAsync,
  selectProperties,
  selectPropertyLoadingState,
  selectPropertyError,
  clearCache as clearReduxCache,
  setFilters,
  updatePropertyStatus
} from '../../store/slices/propertySlice';

interface UsePropertiesOptions {
  cacheTTL?: number;
  debounceMs?: number;
  batchSize?: number;
}

interface OperationStates {
  loading: boolean;
  error: string | null;
}

interface UsePropertiesReturn {
  properties: Property[];
  operationStates: OperationStates;
  searchProperties: (filters: PropertySearchFilters) => Promise<void>;
  updateStatus: (id: string, status: PropertyStatus) => Promise<void>;
  clearCache: () => void;
  refreshProperties: () => Promise<void>;
  isPropertyCached: (filters: PropertySearchFilters) => boolean;
}

/**
 * Custom hook for managing property-related operations with enhanced features
 * Provides caching, debouncing, and optimistic updates
 */
export const useProperties = (options: UsePropertiesOptions = {}): UsePropertiesReturn => {
  const {
    cacheTTL = 5 * 60 * 1000, // 5 minutes default cache
    debounceMs = 300, // 300ms default debounce
    batchSize = 20 // 20 items per batch default
  } = options;

  // Redux hooks
  const dispatch = useDispatch();
  const properties = useSelector(selectProperties);
  const loading = useSelector((state) => selectPropertyLoadingState(state, 'search'));
  const error = useSelector((state) => selectPropertyError(state, 'search'));

  // Local state
  const [currentFilters, setCurrentFilters] = useState<PropertySearchFilters>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Debounced search function
  const [debouncedSearch] = useDebounce(
    (filters: PropertySearchFilters) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Dispatch search action
      dispatch(setFilters(filters));
      dispatch(searchPropertiesAsync(filters));
    },
    debounceMs
  );

  /**
   * Initiates a property search with the given filters
   */
  const searchProperties = useCallback(async (filters: PropertySearchFilters) => {
    try {
      setCurrentFilters(filters);
      await debouncedSearch(filters);
    } catch (err) {
      console.error('Property search failed:', err);
      throw err;
    }
  }, [debouncedSearch]);

  /**
   * Updates a property's status with optimistic update
   */
  const updateStatus = useCallback(async (
    id: string,
    status: PropertyStatus
  ) => {
    try {
      // Optimistic update
      dispatch(updatePropertyStatus({ id, status }));

      // Refresh properties in background
      await dispatch(searchPropertiesAsync(currentFilters));
    } catch (err) {
      // Revert optimistic update on failure
      console.error('Status update failed:', err);
      await dispatch(searchPropertiesAsync(currentFilters));
      throw err;
    }
  }, [dispatch, currentFilters]);

  /**
   * Clears the property cache
   */
  const clearCache = useCallback(() => {
    dispatch(clearReduxCache());
  }, [dispatch]);

  /**
   * Forces a refresh of the current properties
   */
  const refreshProperties = useCallback(async () => {
    await dispatch(searchPropertiesAsync(currentFilters));
  }, [dispatch, currentFilters]);

  /**
   * Checks if properties for given filters are cached
   */
  const isPropertyCached = useCallback((filters: PropertySearchFilters): boolean => {
    const cacheKey = JSON.stringify(filters);
    return Boolean(properties && properties.length > 0 && 
      JSON.stringify(currentFilters) === cacheKey);
  }, [properties, currentFilters]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    properties,
    operationStates: {
      loading,
      error
    },
    searchProperties,
    updateStatus,
    clearCache,
    refreshProperties,
    isPropertyCached
  };
};