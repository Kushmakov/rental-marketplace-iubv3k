import React, { useCallback, useMemo } from 'react';
import { DataGrid, GridColDef, GridValueGetterParams } from '@mui/x-data-grid';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { usePayments } from '../../hooks/usePayments';
import { AuditLogger } from '@company/audit-logger';
import { SensitiveDataMasking } from '@company/data-security';
import { Payment, PaymentStatus, PaymentType } from '../../types/payment';

// Initialize audit logger for PCI compliance
const auditLogger = new AuditLogger({
  component: 'PaymentHistory',
  pciScope: true,
  retentionDays: 90
});

// Initialize data masking for sensitive data
const dataMasking = new SensitiveDataMasking({
  level: 'PCI_DSS',
  maskChar: '•'
});

interface PaymentHistoryProps {
  applicationId?: string;
  propertyId?: string;
  filterTypes?: PaymentType[];
  enableAudit?: boolean;
  userRole: string;
  maskingLevel: 'full' | 'partial' | 'none';
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  applicationId,
  propertyId,
  filterTypes,
  enableAudit = true,
  userRole,
  maskingLevel
}) => {
  // Custom hook for payment data management
  const { payments, loading, error, totalCount, fetchPage } = usePayments();

  // Secure currency formatting with locale support
  const formatCurrency = useCallback((amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD'
      }).format(amount);
    } catch (error) {
      console.error('Currency formatting error:', error);
      return `${currency} ${amount}`;
    }
  }, []);

  // Secure date formatting with timezone support
  const formatDate = useCallback((date: Date) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
      }).format(new Date(date));
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid Date';
    }
  }, []);

  // Secure pagination handler with audit logging
  const handlePageChange = useCallback(async (page: number, pageSize: number) => {
    if (enableAudit) {
      auditLogger.log({
        action: 'VIEW_PAYMENT_PAGE',
        page,
        pageSize,
        userRole,
        timestamp: new Date()
      });
    }

    await fetchPage(page, pageSize);
  }, [fetchPage, enableAudit, userRole]);

  // Define secure grid columns with data masking
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'id',
      headerName: 'Payment ID',
      width: 200,
      valueGetter: (params: GridValueGetterParams) => 
        dataMasking.maskValue(params.row.id, maskingLevel)
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 150,
      valueGetter: (params: GridValueGetterParams) => 
        PaymentType[params.row.type as keyof typeof PaymentType]
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 120,
      valueGetter: (params: GridValueGetterParams) => 
        formatCurrency(params.row.amount, params.row.currency)
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      valueGetter: (params: GridValueGetterParams) => 
        PaymentStatus[params.row.status as keyof typeof PaymentStatus]
    },
    {
      field: 'paidDate',
      headerName: 'Payment Date',
      width: 180,
      valueGetter: (params: GridValueGetterParams) => 
        params.row.paidDate ? formatDate(params.row.paidDate) : 'Pending'
    },
    {
      field: 'dueDate',
      headerName: 'Due Date',
      width: 180,
      valueGetter: (params: GridValueGetterParams) => formatDate(params.row.dueDate)
    }
  ], [formatCurrency, formatDate, maskingLevel]);

  // Filter payments based on provided criteria
  const filteredPayments = useMemo(() => {
    return payments.filter((payment: Payment) => {
      if (applicationId && payment.applicationId !== applicationId) return false;
      if (propertyId && payment.propertyId !== propertyId) return false;
      if (filterTypes && !filterTypes.includes(payment.type)) return false;
      return true;
    });
  }, [payments, applicationId, propertyId, filterTypes]);

  // Handle loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  // Handle error state
  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 400 }}>
      <Typography variant="h6" gutterBottom>
        Payment History
      </Typography>
      <DataGrid
        rows={filteredPayments}
        columns={columns}
        pagination
        paginationMode="server"
        rowCount={totalCount}
        onPageChange={handlePageChange}
        pageSize={10}
        rowsPerPageOptions={[10, 25, 50]}
        disableSelectionOnClick
        loading={loading}
        autoHeight
        getRowId={(row) => row.id}
        sx={{
          '& .MuiDataGrid-cell': {
            fontSize: '0.875rem'
          }
        }}
      />
    </Box>
  );
};

export default PaymentHistory;