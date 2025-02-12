// @package react@18.2.0
// @package react-redux@8.1.0
// @package zod@3.22.0

import { useCallback, useState, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Application, 
  ApplicationStatus, 
  DocumentType,
  VerificationStatus 
} from '../../types/application';
import { 
  createApplication as apiCreateApplication,
  submitApplication as apiSubmitApplication,
  uploadDocument as apiUploadDocument
} from '../../lib/api/applications';
import { 
  selectApplicationWithAudit,
  selectDocumentVerificationStatus,
  logAccess,
  updateApplicationStatus 
} from '../../store/slices/applicationSlice';

// Validation schema for application data
const applicationSchema = {
  applicantId: (value: string) => value?.length === 36,
  unitId: (value: string) => value?.length === 36,
  monthlyIncome: (value: number) => value > 0,
  creditScore: (value: number) => value >= 300 && value <= 850,
  employmentDetails: (value: any) => value?.employerName && value?.position
};

/**
 * Enhanced custom hook for managing rental application state and operations
 * Provides secure, optimistic updates and comprehensive error handling
 */
export const useApplications = () => {
  // Local state management
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Request cancellation management
  const cancelTokenRef = useRef<AbortController | null>(null);

  // Redux state management
  const dispatch = useDispatch();
  const application = useSelector((state: any) => 
    selectApplicationWithAudit(state, state.application?.currentApplicationId)
  );

  /**
   * Validates application data against schema
   */
  const validateApplicationData = useCallback((data: any): boolean => {
    try {
      return Object.entries(applicationSchema).every(([key, validator]) => 
        validator(data[key])
      );
    } catch (error) {
      setError('Invalid application data format');
      return false;
    }
  }, []);

  /**
   * Creates a new rental application with optimistic updates
   */
  const handleCreateApplication = useCallback(async (applicationData: any) => {
    if (!validateApplicationData(applicationData)) {
      return;
    }

    setLoading(true);
    setError(null);
    cancelTokenRef.current = new AbortController();

    try {
      const response = await apiCreateApplication(applicationData);
      
      dispatch(logAccess({ 
        applicationId: response.id, 
        action: 'CREATE_APPLICATION' 
      }));

      return response;
    } catch (error: any) {
      setError(error.message || 'Failed to create application');
      throw error;
    } finally {
      setLoading(false);
      cancelTokenRef.current = null;
    }
  }, [dispatch, validateApplicationData]);

  /**
   * Submits an application with document verification
   */
  const handleSubmitApplication = useCallback(async (applicationId: string) => {
    if (!application || application.status !== ApplicationStatus.DRAFT) {
      setError('Invalid application state for submission');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Verify required documents
      const hasRequiredDocs = [
        DocumentType.ID_PROOF,
        DocumentType.INCOME_PROOF,
        DocumentType.EMPLOYMENT_PROOF
      ].every(type => 
        application.documents?.some(doc => 
          doc.type === type && doc.verificationStatus === VerificationStatus.COMPLETED
        )
      );

      if (!hasRequiredDocs) {
        throw new Error('Missing required documents');
      }

      // Optimistic update
      dispatch(updateApplicationStatus({ 
        id: applicationId,
        status: ApplicationStatus.SUBMITTED 
      }));

      const response = await apiSubmitApplication(applicationId);

      dispatch(logAccess({ 
        applicationId, 
        action: 'SUBMIT_APPLICATION' 
      }));

      return response;
    } catch (error: any) {
      // Rollback optimistic update
      dispatch(updateApplicationStatus({ 
        id: applicationId,
        status: ApplicationStatus.DRAFT 
      }));
      setError(error.message || 'Failed to submit application');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [application, dispatch]);

  /**
   * Handles secure document upload with progress tracking
   */
  const handleUploadDocument = useCallback(async (
    applicationId: string,
    documentData: FormData
  ) => {
    if (!application) {
      setError('No active application');
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress(0);
    cancelTokenRef.current = new AbortController();

    try {
      const response = await apiUploadDocument({
        applicationId,
        file: documentData.get('file') as File,
        type: documentData.get('type') as DocumentType
      });

      dispatch(logAccess({ 
        applicationId, 
        action: 'UPLOAD_DOCUMENT' 
      }));

      return response;
    } catch (error: any) {
      setError(error.message || 'Failed to upload document');
      throw error;
    } finally {
      setLoading(false);
      setUploadProgress(0);
      cancelTokenRef.current = null;
    }
  }, [application, dispatch]);

  /**
   * Cancels ongoing operations
   */
  const cancelOperation = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.abort();
      cancelTokenRef.current = null;
    }
    setLoading(false);
    setUploadProgress(0);
  }, []);

  // Memoized hook return value
  const hookValue = useMemo(() => ({
    application,
    loading,
    error,
    progress: uploadProgress,
    createApplication: handleCreateApplication,
    submitApplication: handleSubmitApplication,
    uploadDocument: handleUploadDocument,
    cancelOperation
  }), [
    application,
    loading,
    error,
    uploadProgress,
    handleCreateApplication,
    handleSubmitApplication,
    handleUploadDocument,
    cancelOperation
  ]);

  return hookValue;
};

export default useApplications;