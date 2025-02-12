import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApplicationForm } from '../../../components/application/ApplicationForm';
import { 
  Application, 
  ApplicationStatus, 
  DocumentType, 
  VerificationStatus 
} from '../../../types/application';
import { createApplication } from '../../../lib/api/applications';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock API functions
vi.mock('../../../lib/api/applications');

// Test data fixtures
const mockUnitId = 'unit-123';
const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
const mockValidFormData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+12345678901',
  monthlyIncome: 5000,
  employmentDetails: {
    employerName: 'Tech Corp',
    position: 'Engineer',
    startDate: new Date('2023-01-01'),
    employmentType: 'Full-time',
    contactPhone: '+12345678902',
    contactEmail: 'hr@techcorp.com'
  },
  preferredMoveInDate: new Date('2024-01-01')
};

const mockApplication: Application = {
  id: 'app-123',
  applicantId: 'user-123',
  unitId: mockUnitId,
  status: ApplicationStatus.SUBMITTED,
  verificationStatus: VerificationStatus.PENDING,
  monthlyIncome: mockValidFormData.monthlyIncome,
  creditScore: 750,
  employmentDetails: mockValidFormData.employmentDetails,
  documents: [],
  preferredMoveInDate: mockValidFormData.preferredMoveInDate,
  notes: '',
  reviewedBy: '',
  reviewedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('ApplicationForm', () => {
  const mockOnSubmitSuccess = vi.fn();
  const mockOnSubmitError = vi.fn();
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    (createApplication as jest.Mock).mockResolvedValue(mockApplication);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      const firstInput = screen.getByLabelText(/First Name/i);
      firstInput.focus();
      expect(document.activeElement).toBe(firstInput);

      await user.tab();
      expect(document.activeElement).toHaveAttribute('aria-label', 'Last Name');
    });
  });

  describe('Form Validation', () => {
    it('should validate required fields', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(screen.getByText(/First name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Last name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    });

    it('should validate email format', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      await user.type(screen.getByLabelText(/Email/i), 'invalid-email');
      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
    });

    it('should validate phone number format', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      await user.type(screen.getByLabelText(/Phone/i), 'invalid-phone');
      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(screen.getByText(/Invalid phone format/i)).toBeInTheDocument();
    });
  });

  describe('Multi-step Navigation', () => {
    it('should navigate through form steps', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      // Fill personal information
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.type(screen.getByLabelText(/Last Name/i), mockValidFormData.lastName);
      await user.type(screen.getByLabelText(/Email/i), mockValidFormData.email);
      await user.type(screen.getByLabelText(/Phone/i), mockValidFormData.phone);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Verify employment step
      expect(screen.getByText(/Employment Details/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Employer Name/i)).toBeInTheDocument();
    });

    it('should allow navigation back to previous steps', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      // Navigate to second step
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Go back
      await user.click(screen.getByRole('button', { name: /back/i }));
      expect(screen.getByLabelText(/First Name/i)).toHaveValue(mockValidFormData.firstName);
    });
  });

  describe('Document Upload', () => {
    it('should handle document uploads', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      // Navigate to document upload step
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      const fileInput = screen.getByLabelText(new RegExp(DocumentType.ID_PROOF, 'i'));
      await user.upload(fileInput, mockFile);

      expect(screen.getByText(/Document uploaded successfully/i)).toBeInTheDocument();
    });

    it('should validate file size limits', async () => {
      const largeFile = new File(['test'.repeat(1000000)], 'large.pdf', { type: 'application/pdf' });
      
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
          securityConfig={{ maxFileSize: 1000, documentValidation: true, encryptPII: true }}
        />
      );

      // Navigate to document upload step
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      const fileInput = screen.getByLabelText(new RegExp(DocumentType.ID_PROOF, 'i'));
      await user.upload(fileInput, largeFile);

      expect(screen.getByText(/File size exceeds maximum limit/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should submit form successfully with valid data', async () => {
      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      // Fill all required fields and navigate through steps
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.type(screen.getByLabelText(/Last Name/i), mockValidFormData.lastName);
      await user.type(screen.getByLabelText(/Email/i), mockValidFormData.email);
      await user.type(screen.getByLabelText(/Phone/i), mockValidFormData.phone);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Employment details
      await user.type(screen.getByLabelText(/Employer Name/i), mockValidFormData.employmentDetails.employerName);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Document upload
      const fileInput = screen.getByLabelText(new RegExp(DocumentType.ID_PROOF, 'i'));
      await user.upload(fileInput, mockFile);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockOnSubmitSuccess).toHaveBeenCalledWith(expect.objectContaining({
          unitId: mockUnitId,
          status: ApplicationStatus.SUBMITTED
        }));
      });
    });

    it('should handle submission errors', async () => {
      const mockError = new Error('Submission failed');
      (createApplication as jest.Mock).mockRejectedValue(mockError);

      render(
        <ApplicationForm
          unitId={mockUnitId}
          onSubmitSuccess={mockOnSubmitSuccess}
          onSubmitError={mockOnSubmitError}
        />
      );

      // Fill form and submit
      await user.type(screen.getByLabelText(/First Name/i), mockValidFormData.firstName);
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockOnSubmitError).toHaveBeenCalledWith(mockError);
      });
    });
  });
});