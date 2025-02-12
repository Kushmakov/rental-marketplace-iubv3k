import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Chip, Box } from '@mui/material';
import { Payment, PaymentType, PaymentStatus } from '../../types/payment';
import { formatCurrency } from '../../utils/currency';

// Props interface with enhanced type safety
interface PaymentSummaryProps {
  payment: Payment;
  showDetails?: boolean;
  className?: string;
  onError?: (error: Error) => void;
}

// Payment type label mapping with localization support
const getPaymentTypeLabel = (type: PaymentType): string => {
  const labels: Record<PaymentType, string> = {
    [PaymentType.APPLICATION_FEE]: 'Application Fee',
    [PaymentType.SECURITY_DEPOSIT]: 'Security Deposit',
    [PaymentType.RENT]: 'Rent Payment',
    [PaymentType.COMMISSION]: 'Commission',
    [PaymentType.LATE_FEE]: 'Late Fee'
  };
  return labels[type] || 'Unknown Payment Type';
};

// Status color mapping with WCAG compliance
const getStatusColor = (status: PaymentStatus): string => {
  const colors: Record<PaymentStatus, string> = {
    [PaymentStatus.PENDING]: 'warning',
    [PaymentStatus.AUTHORIZED]: 'info',
    [PaymentStatus.CAPTURED]: 'success',
    [PaymentStatus.FAILED]: 'error',
    [PaymentStatus.REFUNDED]: 'default',
    [PaymentStatus.DISPUTED]: 'error'
  };
  return colors[status] || 'default';
};

// Error boundary wrapper for component-level error handling
class PaymentSummaryErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent>
            <Typography color="error">
              Error displaying payment summary. Please try again later.
            </Typography>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Memoized payment summary component for performance optimization
const PaymentSummaryBase: React.FC<PaymentSummaryProps> = ({
  payment,
  showDetails = false,
  className,
  onError
}) => {
  // Memoized formatted values for performance
  const formattedAmount = useMemo(
    () => formatCurrency(payment.amount, payment.currency),
    [payment.amount, payment.currency]
  );

  const formattedDueDate = useMemo(
    () => payment.dueDate.toLocaleDateString(),
    [payment.dueDate]
  );

  const formattedPaidDate = useMemo(
    () => payment.paidDate?.toLocaleDateString() || 'Not paid',
    [payment.paidDate]
  );

  return (
    <Card className={className} aria-label="Payment Summary" role="region">
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" component="h2">
            {getPaymentTypeLabel(payment.type)}
          </Typography>
          <Chip
            label={payment.status}
            color={getStatusColor(payment.status)}
            aria-label={`Payment status: ${payment.status}`}
          />
        </Box>

        <Typography variant="h5" component="p" gutterBottom>
          {formattedAmount}
        </Typography>

        <Box mt={2}>
          <Typography variant="body2" color="textSecondary">
            Due Date: {formattedDueDate}
          </Typography>
          {payment.paidDate && (
            <Typography variant="body2" color="textSecondary">
              Paid Date: {formattedPaidDate}
            </Typography>
          )}
        </Box>

        {showDetails && (
          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              Transaction ID: {payment.id}
            </Typography>
            {payment.failureReason && (
              <Typography variant="body2" color="error">
                Failure Reason: {payment.failureReason}
              </Typography>
            )}
            {payment.metadata && Object.keys(payment.metadata).length > 0 && (
              <Typography variant="body2" color="textSecondary">
                Additional Details: {JSON.stringify(payment.metadata)}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

// Export memoized component wrapped in error boundary
export const PaymentSummary = React.memo(
  (props: PaymentSummaryProps) => (
    <PaymentSummaryErrorBoundary onError={props.onError}>
      <PaymentSummaryBase {...props} />
    </PaymentSummaryErrorBoundary>
  )
);

export default PaymentSummary;