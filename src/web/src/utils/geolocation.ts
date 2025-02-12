import { GeoLocation } from '../types/property';

/**
 * Custom error types for geolocation operations
 */
export class GeolocationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/**
 * Interface for getCurrentPosition options
 */
interface GetPositionOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  permissionTimeout?: number;
}

/**
 * Default options for geolocation requests
 */
const DEFAULT_OPTIONS: Required<GetPositionOptions> = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
  permissionTimeout: 5000,
};

/**
 * Earth's radius in kilometers for distance calculations
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Validates geographical coordinates are within valid ranges
 * @param latitude - Latitude to validate
 * @param longitude - Longitude to validate
 * @throws {GeolocationError} If coordinates are invalid
 */
const validateCoordinates = (latitude: number, longitude: number): void => {
  if (latitude < -90 || latitude > 90) {
    throw new GeolocationError(
      'Invalid latitude: must be between -90 and 90 degrees',
      'INVALID_LATITUDE'
    );
  }
  if (longitude < -180 || longitude > 180) {
    throw new GeolocationError(
      'Invalid longitude: must be between -180 and 180 degrees',
      'INVALID_LONGITUDE'
    );
  }
};

/**
 * Formats raw coordinates into a standardized GeoLocation structure
 * @param coords - Raw browser geolocation coordinates
 * @returns Formatted GeoLocation object
 * @throws {GeolocationError} If coordinates are invalid or missing
 */
export const formatCoordinates = (coords: GeolocationCoordinates): GeoLocation => {
  if (!coords) {
    throw new GeolocationError('Coordinates object is null or undefined', 'INVALID_COORDS');
  }

  const latitude = Number(coords.latitude.toFixed(6));
  const longitude = Number(coords.longitude.toFixed(6));

  validateCoordinates(latitude, longitude);

  return {
    latitude,
    longitude,
    accuracy: Math.round(coords.accuracy)
  };
};

/**
 * Enhanced promisified wrapper around browser's geolocation API
 * @param options - Configuration options for geolocation request
 * @returns Promise resolving to formatted GeoLocation
 * @throws {GeolocationError} If geolocation fails or is unsupported
 */
export const getCurrentPosition = async (
  options: GetPositionOptions = {}
): Promise<GeoLocation> => {
  if (!navigator.geolocation) {
    throw new GeolocationError(
      'Geolocation is not supported by this browser',
      'GEOLOCATION_UNSUPPORTED'
    );
  }

  const mergedOptions: Required<GetPositionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return new Promise((resolve, reject) => {
    const permissionTimeout = setTimeout(() => {
      reject(new GeolocationError(
        'Location permission request timed out',
        'PERMISSION_TIMEOUT'
      ));
    }, mergedOptions.permissionTimeout);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(permissionTimeout);
        try {
          resolve(formatCoordinates(position.coords));
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        clearTimeout(permissionTimeout);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new GeolocationError(
              'Location permission denied',
              'PERMISSION_DENIED'
            ));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new GeolocationError(
              'Location information unavailable',
              'POSITION_UNAVAILABLE'
            ));
            break;
          case error.TIMEOUT:
            reject(new GeolocationError(
              'Location request timed out',
              'TIMEOUT'
            ));
            break;
          default:
            reject(new GeolocationError(
              'An unknown error occurred',
              'UNKNOWN_ERROR'
            ));
        }
      },
      {
        enableHighAccuracy: mergedOptions.enableHighAccuracy,
        timeout: mergedOptions.timeout,
        maximumAge: mergedOptions.maximumAge
      }
    );
  });
};

/**
 * Calculates great-circle distance between two points using Haversine formula
 * @param point1 - First geographical point
 * @param point2 - Second geographical point
 * @returns Distance in kilometers with 2 decimal precision
 * @throws {GeolocationError} If coordinates are invalid
 */
export const calculateDistance = (point1: GeoLocation, point2: GeoLocation): number => {
  validateCoordinates(point1.latitude, point1.longitude);
  validateCoordinates(point2.latitude, point2.longitude);

  // Handle identical points
  if (
    point1.latitude === point2.latitude &&
    point1.longitude === point2.longitude
  ) {
    return 0;
  }

  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const lat1 = toRadians(point1.latitude);
  const lon1 = toRadians(point1.longitude);
  const lat2 = toRadians(point2.latitude);
  const lon2 = toRadians(point2.longitude);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Number(distance.toFixed(2));
};

/**
 * Checks if a point is within a specified radius of a center point
 * @param center - Center point of the radius
 * @param point - Point to check
 * @param radiusKm - Radius in kilometers
 * @param unit - Unit of measurement ('km' or 'mi')
 * @returns Boolean indicating if point is within radius
 * @throws {GeolocationError} If coordinates or radius are invalid
 */
export const isWithinRadius = (
  center: GeoLocation,
  point: GeoLocation,
  radiusKm: number,
  unit: 'km' | 'mi' = 'km'
): boolean => {
  validateCoordinates(center.latitude, center.longitude);
  validateCoordinates(point.latitude, point.longitude);

  if (radiusKm <= 0) {
    throw new GeolocationError('Radius must be a positive number', 'INVALID_RADIUS');
  }

  const radius = unit === 'mi' ? radiusKm * 1.60934 : radiusKm;

  if (radius === 0) {
    return (
      center.latitude === point.latitude &&
      center.longitude === point.longitude
    );
  }

  const distance = calculateDistance(center, point);
  return distance <= radius;
};