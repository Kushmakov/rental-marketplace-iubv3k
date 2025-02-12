import { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';
import { GeoLocation } from '../types/property';
import { getCurrentPosition, GeolocationError } from '../utils/geolocation';

/**
 * Options interface for useGeolocation hook configuration
 */
interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  updateInterval?: number;
}

/**
 * Default configuration options for the geolocation hook
 */
const DEFAULT_OPTIONS: Required<UseGeolocationOptions> = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
  updateInterval: 10000,
};

/**
 * Custom hook for managing geolocation functionality with enhanced features
 * Provides real-time location tracking with error handling and performance optimizations
 * 
 * @param options - Configuration options for geolocation tracking
 * @returns Object containing location state, error state, loading state, and metadata
 */
const useGeolocation = (options: UseGeolocationOptions = {}) => {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);

  // Merge provided options with defaults
  const mergedOptions: Required<UseGeolocationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  /**
   * Handles successful position updates
   * Implements debouncing to prevent excessive state updates
   */
  const handlePositionUpdate = useCallback(
    debounce(async () => {
      try {
        const position = await getCurrentPosition({
          enableHighAccuracy: mergedOptions.enableHighAccuracy,
          timeout: mergedOptions.timeout,
          maximumAge: mergedOptions.maximumAge,
        });

        setLocation(position);
        setAccuracy(position.accuracy);
        setTimestamp(Date.now());
        setError(null);
        setLoading(false);
      } catch (err) {
        if (err instanceof GeolocationError) {
          setError(err);
        } else {
          setError(
            new GeolocationError(
              'An unexpected error occurred',
              'UNKNOWN_ERROR'
            )
          );
        }
        setLoading(false);
      }
    }, 100),
    [mergedOptions]
  );

  /**
   * Sets up geolocation watching and handles cleanup
   */
  useEffect(() => {
    let watchId: number;

    const setupGeolocation = async () => {
      if (!navigator.geolocation) {
        setError(
          new GeolocationError(
            'Geolocation is not supported by this browser',
            'GEOLOCATION_UNSUPPORTED'
          )
        );
        setLoading(false);
        return;
      }

      try {
        // Get initial position
        await handlePositionUpdate();

        // Set up position watching
        watchId = navigator.geolocation.watchPosition(
          () => handlePositionUpdate(),
          (error) => {
            let errorCode: string;
            let errorMessage: string;

            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorCode = 'PERMISSION_DENIED';
                errorMessage = 'Location permission denied';
                break;
              case error.POSITION_UNAVAILABLE:
                errorCode = 'POSITION_UNAVAILABLE';
                errorMessage = 'Location information unavailable';
                break;
              case error.TIMEOUT:
                errorCode = 'TIMEOUT';
                errorMessage = 'Location request timed out';
                break;
              default:
                errorCode = 'UNKNOWN_ERROR';
                errorMessage = 'An unknown error occurred';
            }

            setError(new GeolocationError(errorMessage, errorCode));
            setLoading(false);
          },
          {
            enableHighAccuracy: mergedOptions.enableHighAccuracy,
            timeout: mergedOptions.timeout,
            maximumAge: mergedOptions.maximumAge,
          }
        );
      } catch (err) {
        if (err instanceof GeolocationError) {
          setError(err);
        } else {
          setError(
            new GeolocationError(
              'Failed to initialize geolocation',
              'INITIALIZATION_ERROR'
            )
          );
        }
        setLoading(false);
      }
    };

    setupGeolocation();

    // Set up periodic position updates
    const updateInterval = setInterval(
      handlePositionUpdate,
      mergedOptions.updateInterval
    );

    // Cleanup function
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      clearInterval(updateInterval);
      handlePositionUpdate.cancel();
    };
  }, [handlePositionUpdate, mergedOptions]);

  return {
    location,
    error,
    loading,
    accuracy,
    timestamp,
  };
};

export default useGeolocation;
export { GeolocationError };