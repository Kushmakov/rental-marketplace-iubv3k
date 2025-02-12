import React, { useCallback, useState, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Alert, 
  LinearProgress, 
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper
} from '@mui/material'; // @mui/material@5.14.0
import { useTranslation } from 'react-i18next'; // @react-i18next@12.3.1
import { 
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon 
} from '@mui/icons-material'; // @mui/icons-material@5.14.0

import { DocumentType, ApplicationDocument } from '../../types/application';
import LoadingButton from '../common/LoadingButton';

// Maximum file size in bytes (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic'
];

interface DocumentUploadProps {
  applicationId: string;
  documentType: DocumentType;
  onUploadComplete: (document: ApplicationDocument) => void;
  onUploadError: (error: string) => void;
  onUploadProgress: (progress: number) => void;
  isAccessible?: boolean;
  validationRules?: {
    maxFileSize?: number;
    allowedTypes?: string[];
    maxFiles?: number;
  };
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({
  applicationId,
  documentType,
  onUploadComplete,
  onUploadError,
  onUploadProgress,
  isAccessible = true,
  validationRules = {
    maxFileSize: MAX_FILE_SIZE,
    allowedTypes: ALLOWED_FILE_TYPES,
    maxFiles: 1
  }
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<ApplicationDocument[]>([]);

  const validateFile = useCallback((file: File): ValidationResult => {
    if (!validationRules.allowedTypes?.includes(file.type)) {
      return {
        isValid: false,
        error: t('document.error.invalidType', {
          types: validationRules.allowedTypes?.join(', ')
        })
      };
    }

    if (file.size > (validationRules.maxFileSize || MAX_FILE_SIZE)) {
      return {
        isValid: false,
        error: t('document.error.fileTooBig', {
          maxSize: (validationRules.maxFileSize || MAX_FILE_SIZE) / (1024 * 1024)
        })
      };
    }

    if (uploadedFiles.length >= (validationRules.maxFiles || 1)) {
      return {
        isValid: false,
        error: t('document.error.tooManyFiles')
      };
    }

    return { isValid: true };
  }, [uploadedFiles, validationRules, t]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      setError(validation.error);
      onUploadError(validation.error || 'Validation failed');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create secure FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('applicationId', applicationId);

      // Simulated upload with progress tracking
      const response = await new Promise<ApplicationDocument>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.response));
          } else {
            reject(new Error(xhr.statusText));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('POST', '/api/v1/documents/upload', true);
        xhr.send(formData);
      });

      setUploadedFiles(prev => [...prev, response]);
      onUploadComplete(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      onUploadError(errorMessage);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [applicationId, documentType, onUploadComplete, onUploadError, onUploadProgress, validateFile]);

  const handleDelete = useCallback(async (documentId: string) => {
    try {
      await fetch(`/api/v1/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setUploadedFiles(prev => prev.filter(doc => doc.id !== documentId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed';
      setError(errorMessage);
      onUploadError(errorMessage);
    }
  }, [onUploadError]);

  return (
    <Box>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={validationRules.allowedTypes?.join(',')}
        style={{ display: 'none' }}
        aria-label={t('document.upload.inputLabel')}
      />

      <Paper elevation={0} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t(`document.type.${documentType}`)}
        </Typography>

        <LoadingButton
          onClick={() => fileInputRef.current?.click()}
          loading={uploading}
          startIcon={<UploadIcon />}
          disabled={uploadedFiles.length >= (validationRules.maxFiles || 1)}
          aria-label={t('document.upload.buttonLabel')}
        >
          {t('document.upload.button')}
        </LoadingButton>

        {error && (
          <Alert 
            severity="error" 
            onClose={() => setError(null)}
            sx={{ mt: 2 }}
          >
            {error}
          </Alert>
        )}

        {uploading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={0} 
              aria-label={t('document.upload.progress')}
            />
          </Box>
        )}

        {uploadedFiles.length > 0 && (
          <List sx={{ mt: 2 }}>
            {uploadedFiles.map((doc) => (
              <ListItem
                key={doc.id}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={() => handleDelete(doc.id)}
                    aria-label={t('document.delete')}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={doc.fileName}
                  secondary={doc.status}
                  primaryTypographyProps={{
                    component: 'div',
                    sx: { display: 'flex', alignItems: 'center', gap: 1 }
                  }}
                  secondaryTypographyProps={{
                    component: 'div',
                    sx: { display: 'flex', alignItems: 'center', gap: 1 }
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};

export default DocumentUpload;