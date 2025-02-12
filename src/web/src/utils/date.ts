import { format, isValid, parseISO, addDays, differenceInDays } from 'date-fns';
// date-fns v2.30.0

// Types for function parameters
interface DateFormatOptions {
  locale?: Locale;
  timezone?: string;
  includeTime?: boolean;
}

interface ValidationOptions {
  minDate?: Date;
  maxDate?: Date;
  allowWeekends?: boolean;
  businessHoursOnly?: boolean;
}

interface AvailabilityOptions {
  excludeWeekends?: boolean;
  minPeriod?: number;
  maxPeriod?: number;
  timezone?: string;
}

/**
 * Formats a date into a standardized string representation with locale and timezone support
 * @param date - The date to format
 * @param formatString - The desired format pattern
 * @param options - Optional formatting configuration
 * @returns Formatted date string or empty string if invalid
 */
export const formatDate = (
  date: Date,
  formatString: string,
  options: DateFormatOptions = {}
): string => {
  try {
    if (!isValid(date)) {
      return '';
    }

    // Apply timezone offset if specified
    let adjustedDate = date;
    if (options.timezone) {
      const targetTz = new Date(date.toLocaleString('en-US', { timeZone: options.timezone }));
      adjustedDate = new Date(targetTz.getTime() + targetTz.getTimezoneOffset() * 60000);
    }

    return format(adjustedDate, formatString, {
      locale: options.locale,
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return '';
  }
};

/**
 * Parses a date string into a Date object with timezone handling
 * @param dateString - The date string to parse
 * @param timezone - Optional timezone identifier
 * @returns Parsed Date object or null if invalid
 */
export const parseDate = (dateString: string, timezone?: string): Date | null => {
  try {
    const parsedDate = parseISO(dateString);
    
    if (!isValid(parsedDate)) {
      return null;
    }

    if (timezone) {
      const tzDate = new Date(parsedDate.toLocaleString('en-US', { timeZone: timezone }));
      return new Date(tzDate.getTime() + tzDate.getTimezoneOffset() * 60000);
    }

    return parsedDate;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
};

/**
 * Validates if a date string or object is valid with enhanced checking
 * @param date - The date to validate
 * @param validationOptions - Optional validation rules
 * @returns True if date is valid according to specified rules
 */
export const isDateValid = (
  date: Date | string,
  validationOptions: ValidationOptions = {}
): boolean => {
  try {
    const dateToValidate = typeof date === 'string' ? parseISO(date) : date;
    
    if (!isValid(dateToValidate)) {
      return false;
    }

    const { minDate, maxDate, allowWeekends, businessHoursOnly } = validationOptions;

    if (minDate && dateToValidate < minDate) {
      return false;
    }

    if (maxDate && dateToValidate > maxDate) {
      return false;
    }

    if (allowWeekends === false) {
      const day = dateToValidate.getDay();
      if (day === 0 || day === 6) {
        return false;
      }
    }

    if (businessHoursOnly) {
      const hours = dateToValidate.getHours();
      if (hours < 9 || hours >= 17) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Date validation error:', error);
    return false;
  }
};

/**
 * Calculates the availability period between two dates with timezone awareness
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @param options - Optional calculation configuration
 * @returns Number of days between dates
 */
export const calculateAvailabilityPeriod = (
  startDate: Date,
  endDate: Date,
  options: AvailabilityOptions = {}
): number => {
  try {
    if (!isValid(startDate) || !isValid(endDate) || endDate <= startDate) {
      return 0;
    }

    let days = differenceInDays(endDate, startDate);

    if (options.excludeWeekends) {
      let currentDate = startDate;
      while (currentDate < endDate) {
        const day = currentDate.getDay();
        if (day === 0 || day === 6) {
          days--;
        }
        currentDate = addDays(currentDate, 1);
      }
    }

    if (options.minPeriod && days < options.minPeriod) {
      return 0;
    }

    if (options.maxPeriod && days > options.maxPeriod) {
      return 0;
    }

    return days;
  } catch (error) {
    console.error('Availability period calculation error:', error);
    return 0;
  }
};

/**
 * Formats a move-in date for display with locale support
 * @param moveInDate - The move-in date to format
 * @param locale - Optional locale identifier
 * @returns Formatted move-in date string
 */
export const getFormattedMoveInDate = (
  moveInDate: Date,
  locale?: string
): string => {
  try {
    if (!isValid(moveInDate)) {
      return '';
    }

    const formatOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      timeZoneName: 'short'
    };

    return moveInDate.toLocaleString(locale || 'en-US', formatOptions);
  } catch (error) {
    console.error('Move-in date formatting error:', error);
    return '';
  }
};

/**
 * Creates a formatted date range string with timezone handling
 * @param startDate - Range start date
 * @param endDate - Range end date
 * @param options - Optional formatting configuration
 * @returns Formatted date range string
 */
export const getDateRangeString = (
  startDate: Date,
  endDate: Date,
  options: DateFormatOptions = {}
): string => {
  try {
    if (!isValid(startDate) || !isValid(endDate) || endDate <= startDate) {
      return '';
    }

    const formatPattern = options.includeTime 
      ? 'MMM d, yyyy h:mm a'
      : 'MMM d, yyyy';

    const startStr = formatDate(startDate, formatPattern, options);
    const endStr = formatDate(endDate, formatPattern, options);

    if (options.timezone) {
      return `${startStr} - ${endStr} (${options.timezone})`;
    }

    return `${startStr} - ${endStr}`;
  } catch (error) {
    console.error('Date range formatting error:', error);
    return '';
  }
};