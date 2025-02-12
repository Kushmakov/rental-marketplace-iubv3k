import React from 'react'; // ^18.2.0
import { Snackbar, Alert, styled } from '@mui/material'; // ^5.14.0
import { lightTheme } from '../../styles/theme';

// Interface for Toast component props
interface ToastProps {
  open: boolean;
  onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
  message: string;
  severity?: 'success' | 'error' | 'warning' | 'info';
  autoHideDuration?: number;
  anchorOrigin?: {
    vertical: 'top' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  };
  role?: string;
  ariaLabel?: string;
}

// Styled Snackbar component with enhanced positioning and transitions
const StyledSnackbar = styled(Snackbar)(({ theme }) => ({
  zIndex: theme.zIndex.snackbar,
  transition: theme.transitions.create(['top', 'bottom', 'left', 'right']),
  margin: theme.spacing(2),
  position: 'fixed',
  '@media (max-width: 600px)': {
    margin: theme.spacing(1),
    width: `calc(100% - ${theme.spacing(2)})`,
  },
  transformOrigin: 'center',
}));

// Styled Alert component with severity-based styling
const StyledAlert = styled(Alert)(({ theme, severity = 'info' }) => {
  const getSeverityColor = () => {
    const colors = {
      success: theme.palette.success.main,
      error: theme.palette.error.main,
      warning: theme.palette.warning.main,
      info: theme.palette.info.main,
    };
    return colors[severity];
  };

  return {
    padding: theme.spacing(1, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: getSeverityColor(),
    color: theme.palette.getContrastText(getSeverityColor()),
    boxShadow: theme.shadows[3],
    minWidth: '288px',
    maxWidth: '600px',
    '@media (max-width: 600px)': {
      width: '100%',
    },
    '& .MuiAlert-icon': {
      marginRight: theme.spacing(1),
    },
    '& .MuiAlert-message': {
      padding: theme.spacing(0.5, 0),
      fontSize: theme.typography.body2.fontSize,
    },
    '& .MuiAlert-action': {
      padding: theme.spacing(0, 0, 0, 2),
    },
  };
});

// Memoized Toast component for optimal performance
const Toast = React.memo<ToastProps>(({
  open,
  onClose,
  message,
  severity = 'info',
  autoHideDuration = 6000,
  anchorOrigin = {
    vertical: 'top',
    horizontal: 'right',
  },
  role = 'alert',
  ariaLabel,
}) => {
  // Handle Snackbar close events
  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    onClose(event, reason);
  };

  // Auto-cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (open) {
        onClose();
      }
    };
  }, [open, onClose]);

  return (
    <StyledSnackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={anchorOrigin}
      role={role}
      aria-label={ariaLabel || `${severity} notification`}
    >
      <StyledAlert
        onClose={handleClose}
        severity={severity}
        variant="filled"
        elevation={6}
        sx={{ width: '100%' }}
      >
        {message}
      </StyledAlert>
    </StyledSnackbar>
  );
});

// Display name for debugging
Toast.displayName = 'Toast';

export default Toast;