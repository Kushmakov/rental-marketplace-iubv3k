import { useState, useEffect } from 'react'; // react@18.2.0
import { lightTheme } from '../styles/theme';

/**
 * Type-safe options for configuring media queries
 */
interface MediaQueryOptions {
  minWidth?: string | number;
  maxWidth?: string | number;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Creates a standardized media query string from options with type safety
 * @param options - Configuration options for the media query
 * @returns Valid CSS media query string
 */
const createMediaQuery = (options: MediaQueryOptions): string => {
  const conditions: string[] = [];

  if (options.minWidth !== undefined) {
    const value = typeof options.minWidth === 'number' 
      ? `${options.minWidth}px`
      : options.minWidth;
    conditions.push(`(min-width: ${value})`);
  }

  if (options.maxWidth !== undefined) {
    const value = typeof options.maxWidth === 'number'
      ? `${options.maxWidth}px`
      : options.maxWidth;
    conditions.push(`(max-width: ${value})`);
  }

  if (options.orientation) {
    conditions.push(`(orientation: ${options.orientation})`);
  }

  return conditions.join(' and ');
};

/**
 * Hook that returns whether a media query matches the current screen size
 * with optimized performance and SSR support
 * 
 * @param query - Media query string or options object
 * @returns Whether the media query matches the current viewport
 * 
 * @example
 * // Using predefined breakpoints
 * const isMobile = useMediaQuery({ maxWidth: lightTheme.breakpoints.values.sm });
 * 
 * // Using custom query
 * const isLandscape = useMediaQuery({ orientation: 'landscape' });
 * 
 * // Using raw query string
 * const isRetina = useMediaQuery('(-webkit-min-device-pixel-ratio: 2)');
 */
const useMediaQuery = (query: MediaQueryOptions | string): boolean => {
  // Return false during SSR to avoid hydration mismatch
  if (typeof window === 'undefined') {
    return false;
  }

  // Initialize match state
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    // Create media query string if options object provided
    const mediaQuery = typeof query === 'string' ? query : createMediaQuery(query);

    // Create MediaQueryList object
    const mediaQueryList = window.matchMedia(mediaQuery);

    // Set initial match state
    setMatches(mediaQueryList.matches);

    // Handler for media query changes
    const handleChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };

    // Add event listener with modern API if available, fallback for older browsers
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else {
      // @ts-ignore - Fallback for older browsers
      mediaQueryList.addListener(handleChange);
    }

    // Cleanup function
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else {
        // @ts-ignore - Fallback for older browsers
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]); // Re-run effect if query changes

  return matches;
};

export default useMediaQuery;