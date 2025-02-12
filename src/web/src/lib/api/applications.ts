// @package axios@1.4.0
// @package axios-rate-limit@1.3.0
// @package @types/http-errors@2.0.1

import { AxiosResponse } from 'axios';
import rateLimit from 'axios-rate-limit';
import { ApplicationError } from 'http-errors';
import axiosInstance from '../axios';
import { 
  Application, 
  ApplicationStatus, 
  CreateApplicationRequest, 
  UpdateApplicationRequest,
  ApplicationDocument,
  DocumentType,
  VerificationStatus,
  ApplicationSearchFilters,
  UploadDocumentRequest
} from '../../types/application';

// Configure rate limiting for application endpoints
const rateLimitedAxios = rateLimit(axiosInstance, { 
  maxRequests: 100,
  perMilliseconds: 60000,
  maxRPS: 10
});

/**
 * Creates a new rental application with comprehensive validation
 * @param applicationData - Complete application data including required documents
 * @returns Promise resolving to created application
 * @throws ApplicationError for validation or server errors
 */
export const createApplication = async (
  applicationData: CreateApplicationRequest
): Promise<Application> => {
  try {
    validateApplicationData(applicationData);

    const response: AxiosResponse<Application> = await rateLimitedAxios.post(
      '/applications',
      applicationData,
      {
        headers: {
          'X-Request-Type': 'Application-Create',
          'X-Idempotency-Key': generateIdempotencyKey()
        }
      }
    );

    return validateApplicationResponse(response.data);
  } catch (error) {
    throw formatApplicationError(error, 'Error creating application');
  }
};

/**
 * Updates an existing application with partial data
 * @param applicationId - Unique identifier of the application
 * @param updateData - Partial application data to update
 * @returns Promise resolving to updated application
 * @throws ApplicationError for validation or server errors
 */
export const updateApplication = async (
  applicationId: string,
  updateData: UpdateApplicationRequest
): Promise<Application> => {
  try {
    const response: AxiosResponse<Application> = await rateLimitedAxios.put(
      `/applications/${applicationId}`,
      updateData,
      {
        headers: {
          'X-Request-Type': 'Application-Update',
          'X-Idempotency-Key': generateIdempotencyKey()
        }
      }
    );

    return validateApplicationResponse(response.data);
  } catch (error) {
    throw formatApplicationError(error, 'Error updating application');
  }
};

/**
 * Submits an application for review with document verification
 * @param applicationId - Unique identifier of the application
 * @returns Promise resolving to submitted application
 * @throws ApplicationError for validation or submission errors
 */
export const submitApplication = async (
  applicationId: string
): Promise<Application> => {
  try {
    // Verify required documents before submission
    await verifyRequiredDocuments(applicationId);

    const response: AxiosResponse<Application> = await rateLimitedAxios.put(
      `/applications/${applicationId}/submit`,
      {},
      {
        headers: {
          'X-Request-Type': 'Application-Submit',
          'X-Idempotency-Key': generateIdempotencyKey()
        }
      }
    );

    const submittedApplication = validateApplicationResponse(response.data);
    
    if (submittedApplication.status !== ApplicationStatus.SUBMITTED) {
      throw new ApplicationError('Application submission failed');
    }

    return submittedApplication;
  } catch (error) {
    throw formatApplicationError(error, 'Error submitting application');
  }
};

/**
 * Retrieves an application by ID with complete details
 * @param applicationId - Unique identifier of the application
 * @returns Promise resolving to application details
 * @throws ApplicationError if application not found
 */
export const getApplication = async (
  applicationId: string
): Promise<Application> => {
  try {
    const response: AxiosResponse<Application> = await rateLimitedAxios.get(
      `/applications/${applicationId}`
    );

    return validateApplicationResponse(response.data);
  } catch (error) {
    throw formatApplicationError(error, 'Error retrieving application');
  }
};

/**
 * Searches applications with advanced filtering
 * @param filters - Search criteria and filters
 * @returns Promise resolving to array of matching applications
 */
export const searchApplications = async (
  filters: ApplicationSearchFilters
): Promise<Application[]> => {
  try {
    const response: AxiosResponse<Application[]> = await rateLimitedAxios.get(
      '/applications/search',
      { params: filters }
    );

    return response.data.map(validateApplicationResponse);
  } catch (error) {
    throw formatApplicationError(error, 'Error searching applications');
  }
};

/**
 * Uploads a document for an application with verification
 * @param request - Document upload request with file data
 * @returns Promise resolving to updated application with new document
 * @throws ApplicationError for upload or validation errors
 */
export const uploadDocument = async (
  request: UploadDocumentRequest
): Promise<ApplicationDocument> => {
  try {
    const formData = new FormData();
    formData.append('file', request.file);
    formData.append('type', request.type);

    const response: AxiosResponse<ApplicationDocument> = await rateLimitedAxios.post(
      `/applications/${request.applicationId}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Request-Type': 'Document-Upload',
          'X-Idempotency-Key': generateIdempotencyKey()
        }
      }
    );

    return validateDocumentResponse(response.data);
  } catch (error) {
    throw formatApplicationError(error, 'Error uploading document');
  }
};

/**
 * Validates application data before submission
 * @param data - Application data to validate
 * @throws ApplicationError for validation failures
 */
const validateApplicationData = (data: CreateApplicationRequest): void => {
  if (!data.applicantId || !data.unitId) {
    throw new ApplicationError('Missing required application fields');
  }

  if (data.monthlyIncome <= 0) {
    throw new ApplicationError('Invalid monthly income');
  }

  if (!data.employmentDetails?.employerName) {
    throw new ApplicationError('Employment details required');
  }
};

/**
 * Validates application response data
 * @param application - Application data to validate
 * @returns Validated application data
 * @throws ApplicationError for invalid data
 */
const validateApplicationResponse = (application: Application): Application => {
  if (!application.id || !application.status) {
    throw new ApplicationError('Invalid application response data');
  }
  return application;
};

/**
 * Validates document response data
 * @param document - Document data to validate
 * @returns Validated document data
 * @throws ApplicationError for invalid data
 */
const validateDocumentResponse = (document: ApplicationDocument): ApplicationDocument => {
  if (!document.id || !document.type || !document.url) {
    throw new ApplicationError('Invalid document response data');
  }
  return document;
};

/**
 * Verifies required documents are present and valid
 * @param applicationId - Application to verify documents for
 * @throws ApplicationError if required documents are missing or invalid
 */
const verifyRequiredDocuments = async (applicationId: string): Promise<void> => {
  const application = await getApplication(applicationId);
  
  const requiredTypes = [
    DocumentType.ID_PROOF,
    DocumentType.INCOME_PROOF,
    DocumentType.EMPLOYMENT_PROOF
  ];

  const missingTypes = requiredTypes.filter(type => 
    !application.documents?.some(doc => 
      doc.type === type && doc.verificationStatus === VerificationStatus.COMPLETED
    )
  );

  if (missingTypes.length > 0) {
    throw new ApplicationError(
      `Missing or unverified required documents: ${missingTypes.join(', ')}`
    );
  }
};

/**
 * Formats error responses consistently
 * @param error - Original error
 * @param message - Error context message
 * @returns Formatted ApplicationError
 */
const formatApplicationError = (error: any, message: string): ApplicationError => {
  const errorMessage = error.response?.data?.message || message;
  const errorCode = error.response?.status || 500;
  return new ApplicationError(errorMessage, errorCode);
};

/**
 * Generates unique idempotency key for requests
 * @returns Unique idempotency key string
 */
const generateIdempotencyKey = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};