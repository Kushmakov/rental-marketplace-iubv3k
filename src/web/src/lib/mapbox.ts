import mapboxgl from 'mapbox-gl'; // @version ^2.15.0
import Supercluster from '@mapbox/supercluster'; // @version ^7.1.5
import { GeoLocation, Property } from '../types/property';

// Environment and configuration constants
const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const DEFAULT_ZOOM = 12;
const DEFAULT_CENTER = { lat: 40.7128, lng: -74.0060 }; // New York City
const US_BOUNDS = {
  north: 49.384358,
  south: 24.396308,
  east: -66.934570,
  west: -125.000000
};
const CLUSTER_RADIUS = 50;
const MAX_MARKERS_NO_CLUSTER = 100;

// Custom type definitions
interface MapOptions extends mapboxgl.MapboxOptions {
  clustering?: boolean;
  maxBounds?: mapboxgl.LngLatBoundsLike;
}

interface MarkerOptions {
  color?: string;
  scale?: number;
  clustering?: boolean;
}

/**
 * Validates if a location is within US bounds
 */
const isWithinUSBounds = (location: GeoLocation): boolean => {
  return location.latitude <= US_BOUNDS.north &&
         location.latitude >= US_BOUNDS.south &&
         location.longitude <= US_BOUNDS.east &&
         location.longitude >= US_BOUNDS.west;
};

/**
 * Initializes a new Mapbox GL JS map instance with comprehensive configuration
 */
export const initializeMap = async (
  container: HTMLElement,
  options: MapOptions = {}
): Promise<mapboxgl.Map> => {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error('Mapbox access token is required');
  }

  // Check WebGL compatibility
  if (!mapboxgl.supported()) {
    throw new Error('Your browser does not support Mapbox GL');
  }

  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

  // Initialize map with default and custom options
  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxBounds: options.maxBounds || [
      [US_BOUNDS.west, US_BOUNDS.south],
      [US_BOUNDS.east, US_BOUNDS.north]
    ],
    ...options
  });

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl({
    visualizePitch: true,
    showCompass: true
  }));

  // Add scale control
  map.addControl(new mapboxgl.ScaleControl({
    maxWidth: 100,
    unit: 'imperial'
  }));

  // Add fullscreen control
  map.addControl(new mapboxgl.FullscreenControl());

  // Initialize event handlers
  map.on('error', (e) => {
    console.error('Mapbox error:', e);
  });

  // Wait for map to load
  await new Promise<void>((resolve) => {
    map.on('load', () => resolve());
  });

  return map;
};

/**
 * Creates a rich interactive popup with property details
 */
export const createPopup = (
  property: Property,
  options: mapboxgl.PopupOptions = {}
): mapboxgl.Popup => {
  const popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: '300px',
    ...options
  });

  const primaryImage = property.images[0]?.url || '';
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(property.price);

  const content = `
    <div class="property-popup" role="dialog" aria-label="Property Details">
      ${primaryImage ? `
        <div class="property-image">
          <img src="${primaryImage}" alt="${property.address.street1}" loading="lazy" />
        </div>
      ` : ''}
      <div class="property-info">
        <h3>${property.address.street1}</h3>
        <p class="price">${formattedPrice}</p>
        <p>${property.address.city}, ${property.address.state} ${property.address.zipCode}</p>
      </div>
    </div>
  `;

  popup.setHTML(content);
  return popup;
};

/**
 * Adds an interactive marker to the map with clustering support
 */
export const addMarker = (
  map: mapboxgl.Map,
  property: Property,
  options: MarkerOptions = {}
): mapboxgl.Marker => {
  if (!isWithinUSBounds(property.location)) {
    throw new Error('Property location is outside US bounds');
  }

  // Create custom marker element
  const el = document.createElement('div');
  el.className = 'custom-marker';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Property at ${property.address.street1}`);

  // Initialize marker
  const marker = new mapboxgl.Marker({
    element: el,
    color: options.color || '#FF0000',
    scale: options.scale || 1,
    draggable: false
  })
    .setLngLat([property.location.longitude, property.location.latitude]);

  // Create and attach popup
  const popup = createPopup(property);
  marker.setPopup(popup);

  // Add click handler
  el.addEventListener('click', () => {
    marker.togglePopup();
  });

  // Add to map
  marker.addTo(map);

  return marker;
};

/**
 * Adjusts map view to fit all markers with smart padding and animation
 */
export const fitBounds = (
  map: mapboxgl.Map,
  properties: Property[],
  options: mapboxgl.FitBoundsOptions = {}
): void => {
  if (!properties.length) return;

  // Validate locations
  properties.forEach(property => {
    if (!isWithinUSBounds(property.location)) {
      throw new Error(`Property ${property.id} location is outside US bounds`);
    }
  });

  // Calculate bounds
  const bounds = new mapboxgl.LngLatBounds();
  properties.forEach(property => {
    bounds.extend([
      property.location.longitude,
      property.location.latitude
    ]);
  });

  // Calculate smart padding based on screen size
  const padding = Math.min(
    Math.max(window.innerWidth, window.innerHeight) * 0.1,
    100
  );

  // Fit bounds with animation
  map.fitBounds(bounds, {
    padding: {
      top: padding,
      bottom: padding,
      left: padding,
      right: padding
    },
    maxZoom: 16,
    duration: 1000,
    ...options
  });
};

// Export types for external use
export type { MapOptions, MarkerOptions };