import React, { useMemo } from 'react';
import { Box, Typography, Chip, LinearProgress } from '@mui/material'; // @mui/material@5.14.0
import { ApplicationStatus, VerificationStatus } from '../../types/application';
import LoadingButton from '../common/LoadingButton';

interface ApplicationStatusProps {
  status: ApplicationStatus;
  verificationStatus: VerificationStatus;
  onCancelApplication?: () => Promise<void>;
  onWithdrawApplication?: () => Promise<void>;
  isLoading: boolean;
  className?: string;
  ariaLabel?: string;
}

const getStatusColor = (status: ApplicationStatus): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
  switch (status) {
    case ApplicationStatus.DRAFT:
      return 'default';
    case ApplicationStatus.SUBMITTED:
      return 'primary';
    case ApplicationStatus.UNDER_REVIEW:
      return 'warning';
    case ApplicationStatus.APPROVED:
      return 'success';
    case ApplicationStatus.REJECTED:
      return 'error';
    default:
      return 'default';
  }
};

const getStatusLabel = (status: ApplicationStatus): string => {
  switch (status) {
    case ApplicationStatus.DRAFT:
      return 'Draft Application';
    case ApplicationStatus.SUBMITTED:
      return 'Application Submitted';
    case ApplicationStatus.UNDER_REVIEW:
      return 'Under Review';
    case ApplicationStatus.APPROVED:
      return 'Application Approved';
    case ApplicationStatus.REJECTED:
      return 'Application Rejected';
    default:
      return 'Unknown Status';
  }
};

const getVerificationProgress = (status: VerificationStatus): number => {
  switch (status) {
    case VerificationStatus.PENDING:
      return 0;
    case VerificationStatus.IN_PROGRESS:
      return 50;
    case VerificationStatus.COMPLETED:
      return 100;
    default:
      return 0;
  }
};

const ApplicationStatus: React.FC<ApplicationStatusProps> = ({
  status,
  verificationStatus,
  onCancelApplication,
  onWithdrawApplication,
  isLoading,
  className,
  ariaLabel,
}) => {
  const statusColor = useMemo(() => getStatusColor(status), [status]);
  const statusLabel = useMemo(() => getStatusLabel(status), [status]);
  const verificationProgress = useMemo(
    () => getVerificationProgress(verificationStatus),
    [verificationStatus]
  );

  return (
    <Box
      className={className}
      role="region"
      aria-label={ariaLabel || 'Application Status'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 2,
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography variant="h6" component="h2">
          Current Status
        </Typography>
        <Chip
          label={statusLabel}
          color={statusColor}
          aria-label={`Application status: ${statusLabel}`}
          sx={{ fontWeight: 500 }}
        />
      </Box>

      {verificationStatus !== VerificationStatus.COMPLETED && (
        <Box sx={{ width: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Verification Progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {verificationProgress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={verificationProgress}
            aria-label={`Verification progress: ${verificationProgress}%`}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      {status === ApplicationStatus.DRAFT && onCancelApplication && (
        <LoadingButton
          variant="outlined"
          color="error"
          onClick={onCancelApplication}
          loading={isLoading}
          aria-label="Cancel application"
          fullWidth
        >
          Cancel Application
        </LoadingButton>
      )}

      {status === ApplicationStatus.SUBMITTED && onWithdrawApplication && (
        <LoadingButton
          variant="outlined"
          color="error"
          onClick={onWithdrawApplication}
          loading={isLoading}
          aria-label="Withdraw application"
          fullWidth
        >
          Withdraw Application
        </LoadingButton>
      )}
    </Box>
  );
};

export default React.memo(ApplicationStatus);