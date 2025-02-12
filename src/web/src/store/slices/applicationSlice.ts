// @reduxjs/toolkit@1.9.5
import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { 
  Application, 
  ApplicationStatus, 
  VerificationStatus, 
  ApplicationDocument,
  CreateApplicationRequest,
  UpdateApplicationRequest,
  DocumentType
} from '../../types/application';

// State interface with enhanced security and audit features
interface ApplicationState {
  applications: { [key: string]: Application };
  loading: boolean;
  error: string | null;
  securityContext: {
    lastAccessed: Date;
    accessLog: Array<{
      applicationId: string;
      timestamp: Date;
      action: string;
    }>;
  };
}

const initialState: ApplicationState = {
  applications: {},
  loading: false,
  error: null,
  securityContext: {
    lastAccessed: new Date(),
    accessLog: [],
  }
};

// Enhanced async thunk for secure application creation
export const createApplication = createAsyncThunk(
  'application/create',
  async (applicationData: CreateApplicationRequest, { rejectWithValue }) => {
    try {
      // Security validation
      if (!applicationData.applicantId || !applicationData.unitId) {
        throw new Error('Invalid application data');
      }

      // API call would go here
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(applicationData),
      });

      if (!response.ok) {
        throw new Error('Application creation failed');
      }

      const data: Application = await response.json();
      return data;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk for secure document status updates
export const updateDocumentStatus = createAsyncThunk(
  'application/updateDocument',
  async ({ 
    applicationId, 
    documentId, 
    status 
  }: { 
    applicationId: string; 
    documentId: string; 
    status: VerificationStatus 
  }, { rejectWithValue }) => {
    try {
      // API call would go here
      const response = await fetch(`/api/applications/${applicationId}/documents/${documentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Document update failed');
      }

      const data: ApplicationDocument = await response.json();
      return { applicationId, document: data };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Enhanced application slice with security features
const applicationSlice = createSlice({
  name: 'application',
  initialState,
  reducers: {
    resetError: (state) => {
      state.error = null;
    },
    logAccess: (state, action: PayloadAction<{ applicationId: string; action: string }>) => {
      state.securityContext.lastAccessed = new Date();
      state.securityContext.accessLog.push({
        applicationId: action.payload.applicationId,
        timestamp: new Date(),
        action: action.payload.action,
      });
    },
    updateApplicationStatus: (state, action: PayloadAction<{ 
      id: string; 
      status: ApplicationStatus;
      verificationStatus?: VerificationStatus;
    }>) => {
      const application = state.applications[action.payload.id];
      if (application) {
        application.status = action.payload.status;
        if (action.payload.verificationStatus) {
          application.verificationStatus = action.payload.verificationStatus;
        }
        application.updatedAt = new Date();
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createApplication.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createApplication.fulfilled, (state, action) => {
        state.loading = false;
        state.applications[action.payload.id] = action.payload;
        state.securityContext.accessLog.push({
          applicationId: action.payload.id,
          timestamp: new Date(),
          action: 'CREATE',
        });
      })
      .addCase(createApplication.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(updateDocumentStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateDocumentStatus.fulfilled, (state, action) => {
        state.loading = false;
        const application = state.applications[action.payload.applicationId];
        if (application) {
          const documentIndex = application.documents.findIndex(
            doc => doc.id === action.payload.document.id
          );
          if (documentIndex !== -1) {
            application.documents[documentIndex] = action.payload.document;
          }
        }
      })
      .addCase(updateDocumentStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

// Enhanced selectors with security logging
export const selectApplicationWithAudit = createSelector(
  [(state: { application: ApplicationState }) => state.application.applications, 
   (state: { application: ApplicationState }) => state.application.securityContext,
   (state: any, applicationId: string) => applicationId],
  (applications, securityContext, applicationId) => {
    const application = applications[applicationId];
    if (application) {
      securityContext.accessLog.push({
        applicationId,
        timestamp: new Date(),
        action: 'READ',
      });
    }
    return application;
  }
);

export const selectDocumentVerificationStatus = createSelector(
  [(state: { application: ApplicationState }) => state.application.applications,
   (state: any, applicationId: string, documentId: string) => ({ applicationId, documentId })],
  (applications, { applicationId, documentId }) => {
    const application = applications[applicationId];
    if (!application) return null;
    
    const document = application.documents.find(doc => doc.id === documentId);
    return document?.verificationStatus || null;
  }
);

export const { resetError, logAccess, updateApplicationStatus } = applicationSlice.actions;
export default applicationSlice.reducer;