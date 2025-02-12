import { z } from 'zod'; // ^3.22.0
import { isEmail } from 'validator'; // ^13.9.0

// Utility Types
type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

type PasswordValidationResult = ValidationResult & {
  strength: 'weak' | 'medium' | 'strong';
};

type PhoneValidationResult = ValidationResult & {
  formatted: string;
};

// Validation Functions
export const validateEmail = (email: string): ValidationResult => {
  const errors: string[] = [];

  if (!email) {
    errors.push('Email is required');
    return { isValid: false, errors };
  }

  if (!isEmail(email)) {
    errors.push('Invalid email format');
  }

  if (email.length > 254) {
    errors.push('Email exceeds maximum length of 254 characters');
  }

  const [localPart, domain] = email.split('@');
  if (localPart && localPart.length > 64) {
    errors.push('Local part of email exceeds 64 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validatePassword = (password: string): PasswordValidationResult => {
  const errors: string[] = [];
  let strengthScore = 0;

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors, strength: 'weak' };
  }

  // Length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    strengthScore += 1;
  }

  // Complexity checks
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    strengthScore += 1;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    strengthScore += 1;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    strengthScore += 1;
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  } else {
    strengthScore += 1;
  }

  const strength = strengthScore <= 2 ? 'weak' : strengthScore <= 4 ? 'medium' : 'strong';

  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
};

export const validatePhone = (phone: string, countryCode: string = 'US'): PhoneValidationResult => {
  const errors: string[] = [];
  const digitsOnly = phone.replace(/\D/g, '');

  if (!digitsOnly) {
    errors.push('Phone number is required');
    return { isValid: false, errors, formatted: '' };
  }

  const phoneFormats: Record<string, { length: number; format: (n: string) => string }> = {
    US: {
      length: 10,
      format: (n: string) => `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
    }
  };

  const format = phoneFormats[countryCode];
  if (!format) {
    errors.push('Unsupported country code');
    return { isValid: false, errors, formatted: digitsOnly };
  }

  if (digitsOnly.length !== format.length) {
    errors.push(`Phone number must be ${format.length} digits`);
  }

  if (countryCode === 'US' && !/^[2-9]/.test(digitsOnly)) {
    errors.push('Invalid area code');
  }

  return {
    isValid: errors.length === 0,
    errors,
    formatted: errors.length === 0 ? format.format(digitsOnly) : digitsOnly
  };
};

// Authentication Schemas
export const authSchemas = {
  loginSchema: z.object({
    email: z.string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .max(254, 'Email too long'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[0-9]/, 'Password must contain a number')
      .regex(/[!@#$%^&*]/, 'Password must contain a special character'),
    rememberMe: z.boolean().optional()
  }),

  signupSchema: z.object({
    email: z.string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .max(254, 'Email too long'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[0-9]/, 'Password must contain a number')
      .regex(/[!@#$%^&*]/, 'Password must contain a special character'),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine(val => val === true, 'Must accept terms and conditions')
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  }),

  resetPasswordSchema: z.object({
    email: z.string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .max(254, 'Email too long')
  }),

  mfaValidationSchema: z.object({
    code: z.string()
      .length(6, 'MFA code must be 6 digits')
      .regex(/^\d+$/, 'MFA code must contain only numbers')
  })
};

// Application Schemas
export const applicationSchemas = {
  personalInfoSchema: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    ssn: z.string().regex(/^\d{9}$/, 'SSN must be 9 digits'),
    phone: z.string().min(10, 'Phone number is required'),
    email: z.string().email('Invalid email format')
  }),

  employmentSchema: z.object({
    employerName: z.string().min(1, 'Employer name is required'),
    employmentStatus: z.enum(['full-time', 'part-time', 'self-employed', 'unemployed']),
    monthlyIncome: z.number().min(0, 'Monthly income must be positive'),
    employmentLength: z.number().min(0, 'Employment length must be positive'),
    employerContact: z.string().min(1, 'Employer contact is required')
  }),

  rentalHistorySchema: z.object({
    currentAddress: z.string().min(1, 'Current address is required'),
    lengthOfStay: z.number().min(0, 'Length of stay must be positive'),
    landlordName: z.string().min(1, 'Landlord name is required'),
    landlordPhone: z.string().min(10, 'Landlord phone is required'),
    reasonForLeaving: z.string().optional()
  }),

  documentValidationSchema: z.object({
    idDocument: z.object({
      type: z.enum(['passport', 'drivers_license', 'state_id']),
      number: z.string().min(1, 'Document number is required'),
      expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      issuingAuthority: z.string().min(1, 'Issuing authority is required')
    }),
    proofOfIncome: z.object({
      type: z.enum(['pay_stub', 'w2', 'tax_return', 'bank_statement']),
      documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      verified: z.boolean()
    })
  })
};

// Payment Schemas
export const paymentSchemas = {
  creditCardSchema: z.object({
    cardNumber: z.string()
      .regex(/^\d{16}$/, 'Card number must be 16 digits'),
    expirationDate: z.string()
      .regex(/^(0[1-9]|1[0-2])\/([0-9]{2})$/, 'Invalid expiration date format (MM/YY)'),
    cvv: z.string()
      .regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits'),
    cardholderName: z.string()
      .min(1, 'Cardholder name is required')
  }),

  bankAccountSchema: z.object({
    accountNumber: z.string()
      .regex(/^\d{8,17}$/, 'Invalid account number'),
    routingNumber: z.string()
      .regex(/^\d{9}$/, 'Routing number must be 9 digits'),
    accountType: z.enum(['checking', 'savings']),
    accountHolderName: z.string()
      .min(1, 'Account holder name is required')
  }),

  paymentVerificationSchema: z.object({
    amount: z.number()
      .min(0.01, 'Amount must be greater than 0'),
    currency: z.enum(['USD']),
    paymentMethod: z.enum(['credit_card', 'bank_account']),
    billingAddress: z.object({
      street: z.string().min(1, 'Street is required'),
      city: z.string().min(1, 'City is required'),
      state: z.string().length(2, 'State must be 2 characters'),
      zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format')
    })
  })
};