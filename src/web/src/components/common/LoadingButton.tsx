import React, { useCallback } from 'react';
import { Button, ButtonProps, CircularProgress, styled } from '@mui/material'; // @mui/material@5.14.0
import { lightTheme } from '../../styles/theme';

// Props interface extending Material-UI ButtonProps
interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  'aria-label'?: string;
}

// Styled button component with loading state styles
const StyledButton = styled(Button)(({ theme }) => ({
  position: 'relative',
  minWidth: 120,
  transition: 'opacity 0.2s ease-in-out',

  '&.loading': {
    opacity: 0.7,
    cursor: 'not-allowed',
  },

  '& .MuiCircularProgress-root': {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginTop: -12,
    marginLeft: -12,
  },

  // Size-specific spinner styles
  '&.MuiButton-sizeSmall .MuiCircularProgress-root': {
    width: '16px !important',
    height: '16px !important',
    marginTop: -8,
    marginLeft: -8,
  },

  '&.MuiButton-sizeLarge .MuiCircularProgress-root': {
    width: '28px !important',
    height: '28px !important',
    marginTop: -14,
    marginLeft: -14,
  },

  // Focus visible styles for accessibility
  '&.Mui-focusVisible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  disabled = false,
  children,
  onClick,
  size = 'medium',
  color = 'primary',
  variant = 'contained',
  'aria-label': ariaLabel,
  ...props
}) => {
  // Memoize click handler to prevent unnecessary re-renders
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!loading && onClick) {
        onClick(event);
      }
    },
    [loading, onClick]
  );

  // Calculate spinner size based on button size
  const getSpinnerSize = () => {
    switch (size) {
      case 'small':
        return 16;
      case 'large':
        return 28;
      default:
        return 24;
    }
  };

  // Calculate spinner color based on variant and color prop
  const getSpinnerColor = () => {
    if (variant === 'contained') {
      return 'inherit';
    }
    return color || 'primary';
  };

  return (
    <StyledButton
      onClick={handleClick}
      disabled={disabled || loading}
      size={size}
      color={color}
      variant={variant}
      className={loading ? 'loading' : ''}
      aria-busy={loading}
      aria-label={ariaLabel}
      {...props}
    >
      {/* Hide content during loading for screen readers */}
      <span
        style={{
          visibility: loading ? 'hidden' : 'visible',
          display: 'inline-flex',
        }}
      >
        {children}
      </span>

      {/* Loading spinner */}
      {loading && (
        <CircularProgress
          size={getSpinnerSize()}
          color={getSpinnerColor()}
          aria-label="Loading"
        />
      )}
    </StyledButton>
  );
};

export default LoadingButton;