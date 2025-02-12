import React from 'react'; // react@18.2.0
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  IconButton,
  styled,
  useMediaQuery
} from '@mui/material'; // @mui/material@5.14.0
import CloseIcon from '@mui/icons-material/Close'; // @mui/icons-material@5.14.0
import { lightTheme } from '../../styles/theme';
import LoadingButton from './LoadingButton';

// Enhanced props interface for the Modal component
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  loading?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  ariaLabel?: string;
  ariaDescribedby?: string;
  disableBackdropClick?: boolean;
  disableEscapeKeyDown?: boolean;
  onEntered?: () => void;
  onExited?: () => void;
}

// Enhanced styled Dialog with responsive behavior
const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    borderRadius: theme.shape.borderRadius * 2,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    transition: theme.transitions.create(['box-shadow', 'border-radius']),
    padding: theme.spacing(2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(2),
      padding: theme.spacing(1),
      borderRadius: theme.shape.borderRadius,
      maxHeight: `calc(100% - ${theme.spacing(4)})`,
    },
  },
  '& .MuiBackdrop-root': {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  },
  '& .MuiDialog-container': {
    alignItems: 'flex-start',
    [theme.breakpoints.down('sm')]: {
      alignItems: 'center',
    },
  },
  '& .MuiFocusVisible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

// Enhanced close button with accessibility
const CloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(1),
  top: theme.spacing(1),
  color: theme.palette.grey[500],
  padding: theme.spacing(1),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.5),
  },
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&.Mui-focusVisible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

const Modal = React.memo<ModalProps>(({
  open,
  onClose,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  loading = false,
  maxWidth = 'sm',
  fullWidth = true,
  ariaLabel,
  ariaDescribedby,
  disableBackdropClick = false,
  disableEscapeKeyDown = false,
  onEntered,
  onExited,
}) => {
  // Responsive behavior hook
  const isMobile = useMediaQuery(lightTheme.breakpoints.down('sm'));

  // Handle backdrop click
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (disableBackdropClick) {
      event.stopPropagation();
      return;
    }
    onClose();
  };

  // Handle escape key
  const handleEscapeKeyDown = (event: React.KeyboardEvent) => {
    if (disableEscapeKeyDown) {
      event.preventDefault();
      return;
    }
    onClose();
  };

  return (
    <StyledDialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      aria-labelledby={ariaLabel || 'modal-title'}
      aria-describedby={ariaDescribedby}
      onBackdropClick={handleBackdropClick}
      onKeyDown={handleEscapeKeyDown}
      TransitionProps={{
        onEntered,
        onExited,
      }}
    >
      <DialogTitle
        id="modal-title"
        sx={{
          padding: (theme) => theme.spacing(2),
          paddingRight: (theme) => theme.spacing(6),
        }}
      >
        {title}
        <CloseButton
          aria-label="close"
          onClick={onClose}
          size={isMobile ? 'small' : 'medium'}
        >
          <CloseIcon />
        </CloseButton>
      </DialogTitle>

      <DialogContent
        sx={{
          padding: (theme) => theme.spacing(2),
          overflowY: 'auto',
        }}
      >
        {children}
      </DialogContent>

      {(onConfirm || onClose) && (
        <DialogActions
          sx={{
            padding: (theme) => theme.spacing(2),
            justifyContent: 'flex-end',
            gap: (theme) => theme.spacing(1),
          }}
        >
          {onClose && (
            <LoadingButton
              onClick={onClose}
              variant="outlined"
              color="primary"
              size={isMobile ? 'small' : 'medium'}
              aria-label={cancelText}
            >
              {cancelText}
            </LoadingButton>
          )}
          {onConfirm && (
            <LoadingButton
              onClick={onConfirm}
              variant="contained"
              color="primary"
              loading={loading}
              size={isMobile ? 'small' : 'medium'}
              aria-label={confirmText}
            >
              {confirmText}
            </LoadingButton>
          )}
        </DialogActions>
      )}
    </StyledDialog>
  );
});

Modal.displayName = 'Modal';

export default Modal;