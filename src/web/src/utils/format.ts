import { Address } from '../types/property';
import { format } from 'date-fns'; // v2.30.0

/**
 * Formats an address object into a standardized string representation
 * following platform design guidelines
 * @param address - Address object containing location details
 * @returns Formatted address string
 * @throws Error if required address fields are missing
 */
export const formatAddress = (address: Address): string => {
  if (!address.street1 || !address.city || !address.state || !address.zipCode) {
    throw new Error('Invalid address: missing required fields');
  }

  const street = address.street2 
    ? `${address.street1.trim()}, ${address.street2.trim()}`
    : address.street1.trim();

  // Ensure state is uppercase for consistency
  const state = address.state.trim().toUpperCase();
  
  // Format ZIP code to handle both 5 and 9 digit formats
  const zipCode = address.zipCode.replace(/[^\d]/g, '');
  const formattedZip = zipCode.length > 5 
    ? `${zipCode.slice(0, 5)}-${zipCode.slice(5)}`
    : zipCode;

  return `${street}, ${address.city.trim()}, ${state} ${formattedZip}`;
};

/**
 * Formats a phone number string into standardized (XXX) XXX-XXXX format
 * @param phoneNumber - Raw phone number string
 * @returns Formatted phone number string
 * @throws Error if phone number is invalid
 */
export const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.length !== 10) {
    throw new Error('Invalid phone number: must be exactly 10 digits');
  }
  
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
};

/**
 * Formats a name string with proper capitalization and spacing
 * @param name - Raw name string to format
 * @returns Properly formatted name string
 */
export const formatName = (name: string): string => {
  if (!name) return '';
  
  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Handle special case prefixes
      if (word.startsWith('mc')) {
        return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
      }
      if (word.startsWith('mac')) {
        return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4);
      }
      if (word.startsWith("o'")) {
        return "O'" + word.charAt(2).toUpperCase() + word.slice(3);
      }
      
      // Preserve common name suffixes
      const suffixes = ['ii', 'iii', 'iv', 'jr', 'sr'];
      if (suffixes.includes(word)) {
        return word.toUpperCase();
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};

/**
 * Formats square footage values with proper units and thousand separators
 * @param squareFeet - Numeric square footage value
 * @returns Formatted square footage string with units
 * @throws Error if value is invalid
 */
export const formatSquareFeet = (squareFeet: number): string => {
  if (!Number.isFinite(squareFeet) || squareFeet < 0) {
    throw new Error('Invalid square footage value');
  }

  const rounded = Math.round(squareFeet);
  return `${rounded.toLocaleString()} sq ft`;
};

/**
 * Formats bedroom and bathroom counts into standardized display string
 * @param bedrooms - Number of bedrooms
 * @param bathrooms - Number of bathrooms
 * @returns Formatted bed/bath count string
 * @throws Error if values are invalid
 */
export const formatBedBath = (bedrooms: number, bathrooms: number): string => {
  if (!Number.isFinite(bedrooms) || bedrooms < 0 || 
      !Number.isFinite(bathrooms) || bathrooms < 0) {
    throw new Error('Invalid bedroom or bathroom count');
  }

  const bedText = bedrooms === 0 ? 'Studio' : `${bedrooms} bed`;
  
  // Format bathrooms to handle half baths
  const bathText = Number.isInteger(bathrooms) 
    ? `${bathrooms} bath`
    : `${bathrooms.toFixed(1)} bath`;

  return `${bedText} • ${bathText}`;
};

/**
 * Formats a date string according to platform standards
 * @param date - Date to format
 * @param formatString - Optional custom format string
 * @returns Formatted date string
 */
export const formatDate = (date: Date | string, formatString: string = 'MMM d, yyyy'): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatString);
};

/**
 * Formats a currency value according to platform standards
 * @param amount - Numeric amount to format
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};