// @reduxjs/toolkit v1.9.5 - Redux state management with TypeScript support
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { 
  Payment, 
  PaymentType, 
  PaymentStatus,
  PaymentError,
  PaymentFrequency,
  Transaction
} from '../../types/payment';

// Enhanced state interface with comprehensive tracking
interface PaymentState {
  payments: Payment[];
  paymentHistory: Payment[];
  currentPayment: Payment | null;
  transactions: Transaction[];
  loading: boolean;
  processingStatus: 'idle' | 'processing' | 'succeeded' | 'failed';
  error: PaymentError | null;
  validationErrors: string[];
  retryCount: number;
  lastProcessedAt: Date | null;
  metrics: {
    successRate: number;
    averageProcessingTime: number;
    totalProcessed: number;
    failureRate: number;
  };
}

// Initial state with comprehensive tracking
const initialState: PaymentState = {
  payments: [],
  paymentHistory: [],
  currentPayment: null,
  transactions: [],
  loading: false,
  processingStatus: 'idle',
  error: null,
  validationErrors: [],
  retryCount: 0,
  lastProcessedAt: null,
  metrics: {
    successRate: 0,
    averageProcessingTime: 0,
    totalProcessed: 0,
    failureRate: 0,
  }
};

// Maximum retry attempts for failed payments
const MAX_RETRY_ATTEMPTS = 3;
// Exponential backoff base time in milliseconds
const RETRY_BASE_DELAY = 1000;

// Async thunk for processing new payments
export const processPaymentThunk = createAsyncThunk(
  'payment/process',
  async (paymentData: Partial<Payment>, { rejectWithValue }) => {
    try {
      // Validate payment data
      if (!paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Invalid payment amount');
      }

      // Process payment through Stripe
      const response = await fetch('/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error);
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Async thunk for setting up recurring payments
export const setupRecurringPaymentThunk = createAsyncThunk(
  'payment/setupRecurring',
  async (recurringPaymentData: {
    amount: number;
    frequency: PaymentFrequency;
    startDate: Date;
    paymentMethodId: string;
  }, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/payments/recurring/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recurringPaymentData),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error);
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Async thunk for retrying failed payments
export const retryFailedPaymentThunk = createAsyncThunk(
  'payment/retry',
  async (paymentId: string, { getState, rejectWithValue }) => {
    const state = getState() as { payment: PaymentState };
    const payment = state.payment.payments.find(p => p.id === paymentId);

    if (!payment) {
      return rejectWithValue('Payment not found');
    }

    if (payment.retryCount >= MAX_RETRY_ATTEMPTS) {
      return rejectWithValue('Maximum retry attempts exceeded');
    }

    // Calculate exponential backoff delay
    const backoffDelay = RETRY_BASE_DELAY * Math.pow(2, payment.retryCount);
    await new Promise(resolve => setTimeout(resolve, backoffDelay));

    try {
      const response = await fetch(`/api/payments/${paymentId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error);
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Payment slice with comprehensive state management
export const paymentSlice = createSlice({
  name: 'payment',
  initialState,
  reducers: {
    resetPaymentState: (state) => {
      return initialState;
    },
    updatePaymentMetrics: (state, action: PayloadAction<Partial<typeof initialState.metrics>>) => {
      state.metrics = { ...state.metrics, ...action.payload };
    },
    clearPaymentErrors: (state) => {
      state.error = null;
      state.validationErrors = [];
    },
  },
  extraReducers: (builder) => {
    // Process Payment
    builder
      .addCase(processPaymentThunk.pending, (state) => {
        state.loading = true;
        state.processingStatus = 'processing';
        state.error = null;
      })
      .addCase(processPaymentThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.processingStatus = 'succeeded';
        state.currentPayment = action.payload;
        state.payments.push(action.payload);
        state.paymentHistory.push(action.payload);
        state.lastProcessedAt = new Date();
        state.metrics.totalProcessed++;
        state.metrics.successRate = (state.metrics.successRate * (state.metrics.totalProcessed - 1) + 100) / state.metrics.totalProcessed;
      })
      .addCase(processPaymentThunk.rejected, (state, action) => {
        state.loading = false;
        state.processingStatus = 'failed';
        state.error = action.payload as PaymentError;
        state.metrics.totalProcessed++;
        state.metrics.failureRate = (state.metrics.failureRate * (state.metrics.totalProcessed - 1) + 100) / state.metrics.totalProcessed;
      })

    // Setup Recurring Payment
    builder
      .addCase(setupRecurringPaymentThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(setupRecurringPaymentThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.payments.push(action.payload);
      })
      .addCase(setupRecurringPaymentThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as PaymentError;
      })

    // Retry Failed Payment
    builder
      .addCase(retryFailedPaymentThunk.pending, (state, action) => {
        const payment = state.payments.find(p => p.id === action.meta.arg);
        if (payment) {
          payment.status = PaymentStatus.PENDING;
          payment.retryCount++;
        }
      })
      .addCase(retryFailedPaymentThunk.fulfilled, (state, action) => {
        const index = state.payments.findIndex(p => p.id === action.payload.id);
        if (index !== -1) {
          state.payments[index] = action.payload;
          state.paymentHistory.push(action.payload);
        }
      })
      .addCase(retryFailedPaymentThunk.rejected, (state, action) => {
        const payment = state.payments.find(p => p.id === action.meta.arg);
        if (payment) {
          payment.status = PaymentStatus.FAILED;
          payment.failureReason = (action.payload as PaymentError)?.message;
        }
      });
  },
});

// Export actions
export const { 
  resetPaymentState, 
  updatePaymentMetrics, 
  clearPaymentErrors 
} = paymentSlice.actions;

// Selectors
export const selectCurrentPayment = (state: { payment: PaymentState }) => state.payment.currentPayment;
export const selectPaymentHistory = (state: { payment: PaymentState }) => state.payment.paymentHistory;
export const selectPaymentMetrics = (state: { payment: PaymentState }) => state.payment.metrics;
export const selectPaymentErrors = (state: { payment: PaymentState }) => ({
  error: state.payment.error,
  validationErrors: state.payment.validationErrors,
});

// Export reducer
export default paymentSlice.reducer;