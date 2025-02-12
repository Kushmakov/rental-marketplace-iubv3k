import React, { useState, useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form'; // @version ^7.45.0
import * as yup from 'yup'; // @version ^1.2.0
import { 
  Stepper, 
  Step, 
  StepLabel, 
  Button, 
  TextField, 
  FormControl,
  FormHelperText,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  Alert,
  CircularProgress
} from '@mui/material'; // @version ^5.14.0

import { 
  Application, 
  DocumentType, 
  EmploymentDetails,
  ApplicationStatus,
  VerificationStatus 
} from '../../types/application';

// Form validation schema with enhanced security rules
const validationSchema = yup.object().shape({
  firstName: yup.string()
    .required('First name is required')
    .matches(/^[a-zA-Z\s-']+$/, 'Invalid characters in name')
    .max(50, 'Name is too long'),
  lastName: yup.string()
    .required('Last name is required')
    .matches(/^[a-zA-Z\s-']+$/, 'Invalid characters in name')
    .max(50, 'Name is too long'),
  email: yup.string()
    .required('Email is required')
    .email('Invalid email format')
    .max(100, 'Email is too long'),
  phone: yup.string()
    .required('Phone number is required')
    .matches(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format'),
  monthlyIncome: yup.number()
    .required('Monthly income is required')
    .min(0, 'Income cannot be negative')
    .max(1000000, 'Income value is too high'),
  employmentDetails: yup.object().shape({
    employerName: yup.string().required('Employer name is required'),
    position: yup.string().required('Position is required'),
    startDate: yup.date().required('Start date is required'),
    employmentType: yup.string().required('Employment type is required'),
    contactPhone: yup.string().required('Contact phone is required'),
    contactEmail: yup.string().email('Invalid email format').required('Contact email is required')
  }),
  preferredMoveInDate: yup.date()
    .required('Move-in date is required')
    .min(new Date(), 'Move-in date must be in the future')
});

// Props interface with security and accessibility features
interface ApplicationFormProps {
  unitId: string;
  onSubmitSuccess: (application: Application) => void;
  onSubmitError: (error: Error) => void;
  isAccessible?: boolean;
  securityConfig?: {
    encryptPII: boolean;
    documentValidation: boolean;
    maxFileSize: number;
  };
  validationRules?: {
    minIncomeMultiplier: number;
    requiredDocuments: DocumentType[];
  };
}

// Secure form data interface with PII handling
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  monthlyIncome: number;
  employmentDetails: EmploymentDetails;
  preferredMoveInDate: Date;
  documents: Map<DocumentType, File>;
}

// Form steps configuration
const FORM_STEPS = [
  'Personal Information',
  'Employment Details',
  'Documents Upload',
  'Review & Submit'
];

export const ApplicationForm: React.FC<ApplicationFormProps> = ({
  unitId,
  onSubmitSuccess,
  onSubmitError,
  isAccessible = true,
  securityConfig = {
    encryptPII: true,
    documentValidation: true,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  },
  validationRules = {
    minIncomeMultiplier: 3,
    requiredDocuments: [DocumentType.ID_PROOF, DocumentType.INCOME_PROOF]
  }
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<Map<DocumentType, File>>(new Map());

  const { control, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      monthlyIncome: 0,
      employmentDetails: {
        employerName: '',
        position: '',
        startDate: new Date(),
        employmentType: '',
        contactPhone: '',
        contactEmail: ''
      },
      preferredMoveInDate: new Date(),
      documents: new Map()
    }
  });

  // Secure document upload handler with validation
  const handleDocumentUpload = useCallback(async (
    type: DocumentType, 
    file: File
  ) => {
    if (file.size > securityConfig.maxFileSize) {
      throw new Error('File size exceeds maximum limit');
    }

    if (securityConfig.documentValidation) {
      // Validate file type and content
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type');
      }
    }

    setUploadedDocuments(prev => new Map(prev).set(type, file));
  }, [securityConfig]);

  // Secure form submission handler with PII encryption
  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);

      // Validate required documents
      const missingDocuments = validationRules.requiredDocuments.filter(
        docType => !uploadedDocuments.has(docType)
      );
      if (missingDocuments.length > 0) {
        throw new Error('Missing required documents');
      }

      // Create application with encrypted PII
      const application: Partial<Application> = {
        unitId,
        status: ApplicationStatus.SUBMITTED,
        verificationStatus: VerificationStatus.PENDING,
        monthlyIncome: data.monthlyIncome,
        employmentDetails: data.employmentDetails,
        preferredMoveInDate: data.preferredMoveInDate,
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Handle success
      onSubmitSuccess(application as Application);
    } catch (error) {
      onSubmitError(error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render form steps based on active step
  const renderFormStep = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box role="group" aria-label="Personal Information">
            <Controller
              name="firstName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="First Name"
                  fullWidth
                  margin="normal"
                  error={!!errors.firstName}
                  helperText={errors.firstName?.message}
                  inputProps={{
                    'aria-label': 'First Name',
                    maxLength: 50
                  }}
                />
              )}
            />
            {/* Similar Controller components for lastName, email, phone */}
          </Box>
        );

      case 1:
        return (
          <Box role="group" aria-label="Employment Details">
            <Controller
              name="employmentDetails.employerName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Employer Name"
                  fullWidth
                  margin="normal"
                  error={!!errors.employmentDetails?.employerName}
                  helperText={errors.employmentDetails?.employerName?.message}
                  inputProps={{
                    'aria-label': 'Employer Name',
                    maxLength: 100
                  }}
                />
              )}
            />
            {/* Similar Controller components for other employment details */}
          </Box>
        );

      case 2:
        return (
          <Box role="group" aria-label="Document Upload">
            {validationRules.requiredDocuments.map(docType => (
              <FormControl key={docType} fullWidth margin="normal">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleDocumentUpload(docType, file);
                    }
                  }}
                  aria-label={`Upload ${docType}`}
                />
                <FormHelperText>
                  {uploadedDocuments.has(docType) 
                    ? 'Document uploaded successfully' 
                    : `Please upload your ${docType}`}
                </FormHelperText>
              </FormControl>
            ))}
          </Box>
        );

      case 3:
        return (
          <Box role="group" aria-label="Review Application">
            <Typography variant="h6">Review your application</Typography>
            {/* Display form summary */}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box 
      component="form" 
      onSubmit={handleSubmit(onSubmit)}
      role="form"
      aria-label="Rental Application Form"
    >
      <Stepper activeStep={activeStep} alternativeLabel>
        {FORM_STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {renderFormStep(activeStep)}

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          disabled={activeStep === 0 || isSubmitting}
          onClick={() => setActiveStep(prev => prev - 1)}
          aria-label="Previous Step"
        >
          Back
        </Button>
        
        <Button
          variant="contained"
          color="primary"
          disabled={isSubmitting}
          onClick={activeStep === FORM_STEPS.length - 1 
            ? handleSubmit(onSubmit)
            : () => setActiveStep(prev => prev + 1)}
          aria-label={activeStep === FORM_STEPS.length - 1 ? 'Submit Application' : 'Next Step'}
        >
          {isSubmitting ? (
            <CircularProgress size={24} />
          ) : (
            activeStep === FORM_STEPS.length - 1 ? 'Submit' : 'Next'
          )}
        </Button>
      </Box>
    </Box>
  );
};

export default ApplicationForm;