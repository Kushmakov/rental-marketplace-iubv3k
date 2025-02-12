import { User } from '../types/auth';
import { Unit } from '../types/property';

/**
 * Enumeration of application statuses
 * Tracks the complete lifecycle of a rental application
 */
export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

/**
 * Enumeration of verification check statuses
 * Tracks the progress of applicant verification
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Enumeration of required document types
 * Defines valid supporting documents for applications
 */
export enum DocumentType {
  ID_PROOF = 'ID_PROOF',
  INCOME_PROOF = 'INCOME_PROOF',
  EMPLOYMENT_PROOF = 'EMPLOYMENT_PROOF',
  REFERENCE_LETTER = 'REFERENCE_LETTER'
}

/**
 * Employment verification details interface
 * Contains comprehensive employment information for verification
 */
export interface EmploymentDetails {
  employerName: string;
  position: string;
  startDate: Date;
  employmentType: string;
  contactPhone: string;
  contactEmail: string;
}

/**
 * Application document interface
 * Manages supporting documents with verification status
 */
export interface ApplicationDocument {
  id: string;
  type: DocumentType;
  url: string;
  fileName: string;
  uploadedAt: Date;
  verificationStatus: VerificationStatus;
}

/**
 * Comprehensive rental application interface
 * Core data structure for rental applications with complete tracking
 */
export interface Application {
  id: string;
  applicantId: string;
  unitId: string;
  status: ApplicationStatus;
  verificationStatus: VerificationStatus;
  monthlyIncome: number;
  creditScore: number;
  employmentDetails: EmploymentDetails;
  documents: ApplicationDocument[];
  preferredMoveInDate: Date;
  notes: string;
  reviewedBy: string;
  reviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Application creation request interface
 * Ensures all required fields are provided when creating new applications
 */
export interface CreateApplicationRequest extends Omit<Application, 
  'id' | 'status' | 'verificationStatus' | 'reviewedBy' | 'reviewedAt' | 'createdAt' | 'updatedAt'> {
  unit: Pick<Unit, 'id' | 'propertyId' | 'monthlyRent'>;
}

/**
 * Application update request interface
 * Supports partial updates to existing applications
 */
export interface UpdateApplicationRequest extends Partial<Omit<Application, 
  'id' | 'applicantId' | 'unitId' | 'createdAt' | 'updatedAt'>> {
  id: string;
}

/**
 * Application review request interface
 * Handles application approval/rejection process
 */
export interface ReviewApplicationRequest {
  id: string;
  status: ApplicationStatus.APPROVED | ApplicationStatus.REJECTED;
  notes: string;
  reviewedBy: string;
}

/**
 * Document upload request interface
 * Manages secure document uploads for applications
 */
export interface UploadDocumentRequest {
  applicationId: string;
  type: DocumentType;
  file: File;
}

/**
 * Application search filters interface
 * Supports advanced application search functionality
 */
export interface ApplicationSearchFilters {
  status?: ApplicationStatus;
  verificationStatus?: VerificationStatus;
  applicantId?: string;
  unitId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  minIncome?: number;
  minCreditScore?: number;
}

/**
 * Application validation rules interface
 * Defines business rules for application validation
 */
export interface ApplicationValidationRules {
  minCreditScore: number;
  minIncomeMultiplier: number;
  requiredDocuments: DocumentType[];
  maxApplicationsPerUnit: number;
  applicationExpiryDays: number;
}