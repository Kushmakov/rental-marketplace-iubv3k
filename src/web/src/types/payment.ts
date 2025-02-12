// @stripe/stripe-js v2.x - Stripe types for client-side payment processing and PCI compliance
import type { Stripe } from '@stripe/stripe-js';

// Payment type enums
export enum PaymentType {
  APPLICATION_FEE = 'application_fee',
  SECURITY_DEPOSIT = 'security_deposit',
  RENT = 'rent',
  LATE_FEE = 'late_fee',
  COMMISSION = 'commission'
}

export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export enum PaymentFrequency {
  ONE_TIME = 'one_time',
  MONTHLY = 'monthly',
  BI_WEEKLY = 'bi_weekly',
  WEEKLY = 'weekly',
  QUARTERLY = 'quarterly'
}

export enum TransactionType {
  AUTHORIZATION = 'authorization',
  CAPTURE = 'capture',
  REFUND = 'refund',
  CHARGEBACK = 'chargeback',
  FEE = 'fee',
  TRANSFER = 'transfer'
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  PROCESSING = 'processing'
}

export enum PaymentProcessor {
  STRIPE = 'stripe',
  PLAID = 'plaid',
  ACH = 'ach',
  WIRE = 'wire'
}

// Interface for saved payment methods
export interface PaymentMethod {
  id: string;
  type: string;
  processor: PaymentProcessor;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

// Interface for standardized payment errors
export interface PaymentError {
  code: string;
  message: string;
  processorError: Record<string, any>;
}

// Interface for comprehensive payment object
export interface Payment {
  id: string;
  applicationId: string;
  propertyId: string;
  userId: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  frequency: PaymentFrequency;
  dueDate: Date;
  paidDate: Date | null;
  stripePaymentIntentId?: string;
  paymentMethodId?: string;
  failureReason?: string;
  retryCount: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for detailed transaction tracking
export interface Transaction {
  id: string;
  paymentId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  description: string;
  stripeTransactionId?: string;
  processorResponse: Record<string, any>;
  ipAddress?: string;
  riskScore?: number;
  metadata: Record<string, any>;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}