/**
 * Currency Utility Module
 * Provides comprehensive currency handling functionality for the rental platform
 * including formatting, parsing, validation and conversion between currencies.
 * 
 * @packageDocumentation
 */

// External imports
import { Decimal } from 'decimal.js'; // v10.4.3
import { memoize } from 'lodash'; // v4.17.21

// Constants
export const DEFAULT_CURRENCY = 'USD';
export const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP'] as const;
const DECIMAL_PLACES = 2;
const EXCHANGE_RATE_CACHE_TTL = 300000; // 5 minutes in milliseconds
const MAX_AMOUNT = new Decimal(999999999.99);

// Types
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
type ExchangeRateCache = {
  [key: string]: {
    rate: number;
    timestamp: number;
  };
};

// Cache for exchange rates
const exchangeRateCache: ExchangeRateCache = {};

/**
 * Formats a numeric amount into a localized currency string
 * @param amount - Numeric amount to format
 * @param currency - Currency code (defaults to USD)
 * @param locale - Locale string (defaults to en-US)
 * @returns Formatted currency string
 * @throws Error if amount is invalid
 */
export const formatCurrency = memoize((
  amount: number,
  currency: SupportedCurrency = DEFAULT_CURRENCY,
  locale: string = 'en-US'
): string => {
  if (!validateCurrencyAmount(amount, currency)) {
    throw new Error(`Invalid currency amount: ${amount}`);
  }

  const decimalAmount = new Decimal(amount).toDecimalPlaces(DECIMAL_PLACES);
  
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: DECIMAL_PLACES,
    maximumFractionDigits: DECIMAL_PLACES
  });

  return formatter.format(decimalAmount.toNumber());
}, (amount, currency = DEFAULT_CURRENCY, locale = 'en-US') => 
  `${amount}-${currency}-${locale}`);

/**
 * Parses a currency string into a numeric amount
 * @param currencyString - String containing currency amount
 * @param locale - Locale string for parsing (defaults to en-US)
 * @returns Numeric amount with proper decimal precision
 * @throws Error if string cannot be parsed
 */
export const parseCurrencyString = (
  currencyString: string,
  locale: string = 'en-US'
): number => {
  // Remove currency symbols and formatting
  const cleanString = currencyString
    .replace(/[^\d.,\-]/g, '')
    .replace(/,/g, '.');

  try {
    const decimal = new Decimal(cleanString);
    
    if (!decimal.isFinite()) {
      throw new Error('Invalid currency string');
    }

    const amount = decimal.toDecimalPlaces(DECIMAL_PLACES).toNumber();
    
    if (!validateCurrencyAmount(amount, DEFAULT_CURRENCY)) {
      throw new Error('Parsed amount is invalid');
    }

    return amount;
  } catch (error) {
    throw new Error(`Failed to parse currency string: ${currencyString}`);
  }
};

/**
 * Validates a currency amount
 * @param amount - Amount to validate
 * @param currency - Currency code for validation rules
 * @returns Boolean indicating if amount is valid
 */
export const validateCurrencyAmount = (
  amount: number,
  currency: SupportedCurrency = DEFAULT_CURRENCY
): boolean => {
  // Basic number validation
  if (!Number.isFinite(amount)) {
    return false;
  }

  const decimal = new Decimal(amount);

  // Check decimal places
  if (decimal.decimalPlaces() > DECIMAL_PLACES) {
    return false;
  }

  // Check for negative amounts
  if (decimal.isNegative()) {
    return false;
  }

  // Check maximum amount
  if (decimal.greaterThan(MAX_AMOUNT)) {
    return false;
  }

  // Currency-specific validation
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return false;
  }

  return true;
};

/**
 * Converts an amount between currencies using real-time exchange rates
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @returns Promise resolving to converted amount
 * @throws Error if conversion fails
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency
): Promise<number> => {
  if (!validateCurrencyAmount(amount, fromCurrency)) {
    throw new Error(`Invalid amount for conversion: ${amount} ${fromCurrency}`);
  }

  if (fromCurrency === toCurrency) {
    return amount;
  }

  const cacheKey = `${fromCurrency}-${toCurrency}`;
  const now = Date.now();

  // Check cache
  if (
    exchangeRateCache[cacheKey] &&
    now - exchangeRateCache[cacheKey].timestamp < EXCHANGE_RATE_CACHE_TTL
  ) {
    const convertedAmount = new Decimal(amount)
      .times(exchangeRateCache[cacheKey].rate)
      .toDecimalPlaces(DECIMAL_PLACES)
      .toNumber();
    
    return convertedAmount;
  }

  try {
    // Fetch current exchange rate
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rate');
    }

    const data = await response.json();
    const rate = data.rates[toCurrency];

    if (!rate) {
      throw new Error(`Exchange rate not available for ${fromCurrency} to ${toCurrency}`);
    }

    // Update cache
    exchangeRateCache[cacheKey] = {
      rate,
      timestamp: now
    };

    // Perform conversion
    const convertedAmount = new Decimal(amount)
      .times(rate)
      .toDecimalPlaces(DECIMAL_PLACES)
      .toNumber();

    return convertedAmount;
  } catch (error) {
    throw new Error(`Currency conversion failed: ${error.message}`);
  }
};