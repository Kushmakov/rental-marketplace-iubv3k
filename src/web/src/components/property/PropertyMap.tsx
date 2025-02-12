import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl'; // @version ^2.15.0
import { initializeMap, addMarker, fitBounds, createPopup, MapOptions } from '../../lib/mapbox';
import { Property } from '../../types/property';

// Interface for component props with comprehensive options
interface PropertyMapProps {
  properties: Property | Property[];
  height?: string;
  width?: string;
  zoom?: number;
  interactive?: boolean;
  clusteringEnabled?: boolean;
  darkMode?: boolean;
  onMapLoad?: (map: mapboxgl.Map) => void;
  onMarkerClick?: (property: Property) => void;
  onError?: (error: Error) => void;
}

// Custom hook for map initialization and lifecycle management
const useMapInitialization = (
  containerRef: React.RefObject<HTMLDivElement>,
  options: MapOptions
) => {
  const [mapState, setMapState] = useState<{
    map: mapboxgl.Map | null;
    loading: boolean;
    error: Error | null;
  }>({
    map: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const initMap = async () => {
      if (!containerRef.current) return;

      try {
        const map = await initializeMap(containerRef.current, {
          ...options,
          style: options.darkMode 
            ? 'mapbox://styles/mapbox/dark-v11'
            : 'mapbox://styles/mapbox/streets-v12',
        });

        if (mounted) {
          setMapState({
            map,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (mounted) {
          setMapState({
            map: null,
            loading: false,
            error: error as Error,
          });
        }
      }
    };

    initMap();

    return () => {
      mounted = false;
      if (mapState.map) {
        mapState.map.remove();
      }
    };
  }, [options]);

  return mapState;
};

export const PropertyMap: React.FC<PropertyMapProps> = ({
  properties,
  height = '400px',
  width = '100%',
  zoom = 12,
  interactive = true,
  clusteringEnabled = true,
  darkMode = false,
  onMapLoad,
  onMarkerClick,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Convert single property to array for consistent handling
  const propertyArray = Array.isArray(properties) ? properties : [properties];

  // Initialize map with options
  const { map, loading, error } = useMapInitialization(containerRef, {
    zoom,
    interactive,
    clustering: clusteringEnabled && propertyArray.length > 1,
    darkMode,
  });

  // Handle errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Add markers and fit bounds when map and properties are ready
  useEffect(() => {
    if (!map || loading) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    try {
      // Add markers for each property
      propertyArray.forEach(property => {
        const marker = addMarker(map, property, {
          color: darkMode ? '#FFFFFF' : '#FF0000',
          scale: 1,
          clustering: clusteringEnabled,
        });

        // Add click handler if provided
        if (onMarkerClick) {
          marker.getElement().addEventListener('click', () => {
            onMarkerClick(property);
          });
        }

        markersRef.current.push(marker);
      });

      // Fit bounds to show all markers
      if (propertyArray.length > 0) {
        fitBounds(map, propertyArray, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
        });
      }

      // Trigger onMapLoad callback
      if (onMapLoad) {
        onMapLoad(map);
      }
    } catch (err) {
      if (onError) {
        onError(err as Error);
      }
    }
  }, [map, loading, propertyArray, darkMode, clusteringEnabled, onMapLoad, onMarkerClick, onError]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width,
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
      role="region"
      aria-label="Property Map"
    >
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
          }}
          role="status"
          aria-label="Loading map"
        >
          Loading map...
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'red',
            zIndex: 1,
          }}
          role="alert"
        >
          Error loading map: {error.message}
        </div>
      )}
    </div>
  );
};

export default PropertyMap;