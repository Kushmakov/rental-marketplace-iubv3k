/**
 * Core TypeScript model defining the rental application entity structure.
 * Implements comprehensive application lifecycle management, document verification,
 * employment verification, and audit trail tracking.
 * @packageDocumentation
 */

import { BaseEntity, User, UserProfile } from '@common/interfaces';
import { Unit } from '@listing-service/models';

/**
 * Enumeration of possible application statuses
 */
export enum ApplicationStatus {
  /** Initial draft state */
  DRAFT = 'DRAFT',
  /** Application submitted for review */
  SUBMITTED = 'SUBMITTED',
  /** Under property manager review */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Application approved */
  APPROVED = 'APPROVED',
  /** Application rejected */
  REJECTED = 'REJECTED',
  /** Application cancelled by applicant */
  CANCELLED = 'CANCELLED'
}

/**
 * Enumeration of verification check statuses
 */
export enum VerificationStatus {
  /** Verification not yet started */
  PENDING = 'PENDING',
  /** Verification in progress */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Verification successfully completed */
  COMPLETED = 'COMPLETED',
  /** Verification failed */
  FAILED = 'FAILED'
}

/**
 * Enumeration of required document types
 */
export enum DocumentType {
  /** Government-issued ID proof */
  ID_PROOF = 'ID_PROOF',
  /** Income verification documents */
  INCOME_PROOF = 'INCOME_PROOF',
  /** Employment verification documents */
  EMPLOYMENT_PROOF = 'EMPLOYMENT_PROOF',
  /** Reference letters */
  REFERENCE_LETTER = 'REFERENCE_LETTER'
}

/**
 * Interface for employment details with verification contact information
 */
export interface EmploymentDetails {
  /** Name of the employer */
  readonly employerName: string;
  /** Job title/position */
  readonly position: string;
  /** Employment start date */
  readonly startDate: Date;
  /** Type of employment (full-time, part-time, contract) */
  readonly employmentType: string;
  /** HR/Manager contact phone for verification */
  readonly contactPhone: string;
  /** HR/Manager contact email for verification */
  readonly contactEmail: string;
}

/**
 * Interface for application documents with verification tracking
 */
export interface ApplicationDocument {
  /** Unique document identifier */
  readonly id: string;
  /** Type of document */
  readonly type: DocumentType;
  /** Secure URL to the document */
  readonly url: string;
  /** Original filename */
  readonly fileName: string;
  /** Upload timestamp */
  readonly uploadedAt: Date;
  /** Document verification status */
  readonly verificationStatus: VerificationStatus;
}

/**
 * Core application interface extending BaseEntity with comprehensive
 * application processing and verification features
 */
export interface Application extends BaseEntity {
  /** Unique identifier inherited from BaseEntity */
  readonly id: string;

  /** Reference to the applicant user */
  readonly applicantId: string;

  /** Reference to the applied unit */
  readonly unitId: string;

  /** Current application status */
  status: ApplicationStatus;

  /** Overall verification status */
  verificationStatus: VerificationStatus;

  /** Applicant's monthly income */
  readonly monthlyIncome: number;

  /** Applicant's credit score */
  readonly creditScore: number;

  /** Detailed employment information */
  readonly employmentDetails: EmploymentDetails;

  /** Array of required documents */
  readonly documents: readonly ApplicationDocument[];

  /** Requested move-in date */
  readonly preferredMoveInDate: Date;

  /** Application notes/comments */
  notes: string;

  /** ID of the staff member who reviewed the application */
  readonly reviewedBy: string | null;

  /** Timestamp of review completion */
  readonly reviewedAt: Date | null;

  /** Creation timestamp inherited from BaseEntity */
  readonly createdAt: Date;

  /** Last update timestamp inherited from BaseEntity */
  readonly updatedAt: Date;
}