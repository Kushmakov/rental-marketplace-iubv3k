import { Injectable, UseInterceptors, CacheInterceptor } from '@nestjs/common'; // @nestjs/common v10.0.0
import { Logger } from 'winston'; // winston v3.9.0
import { Cache } from '@nestjs/cache-manager'; // @nestjs/cache-manager v2.0.0
import { CircuitBreaker } from '@nestjs/circuit-breaker'; // @nestjs/circuit-breaker v1.0.0

import { Application, ApplicationStatus, VerificationStatus } from '../models/application.model';
import { ApplicationRepository } from '../repositories/application.repository';
import { VerificationService } from './verification.service';

/**
 * Enhanced service handling rental application lifecycle with high-performance
 * processing, caching, and comprehensive error handling
 */
@Injectable()
@UseInterceptors(CacheInterceptor)
export class ApplicationService {
  // Cache TTL constants
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'app:';

  constructor(
    private readonly applicationRepository: ApplicationRepository,
    private readonly verificationService: VerificationService,
    private readonly logger: Logger,
    private readonly cacheManager: Cache,
    private readonly circuitBreaker: CircuitBreaker
  ) {
    // Configure circuit breaker for external service calls
    this.circuitBreaker.configure({
      timeout: 5000,
      errorThreshold: 50,
      resetTimeout: 30000
    });
  }

  /**
   * Creates new application with enhanced validation and audit logging
   * @param applicationData - Application creation DTO
   * @returns Promise resolving to created application
   */
  async createApplication(applicationData: Partial<Application>): Promise<Application> {
    this.logger.debug('Creating new application', {
      applicantId: applicationData.applicantId,
      unitId: applicationData.unitId
    });

    try {
      // Create application with initial status
      const application = await this.applicationRepository.createApplication({
        ...applicationData,
        status: ApplicationStatus.DRAFT,
        verificationStatus: VerificationStatus.PENDING
      });

      // Cache the newly created application
      await this.cacheManager.set(
        `${this.CACHE_PREFIX}${application.id}`,
        application,
        this.CACHE_TTL
      );

      this.logger.info('Application created successfully', {
        applicationId: application.id,
        status: application.status
      });

      return application;

    } catch (error) {
      this.logger.error('Failed to create application', {
        error: error.message,
        applicantId: applicationData.applicantId
      });
      throw error;
    }
  }

  /**
   * Submits application with enhanced verification and monitoring
   * @param applicationId - Application identifier
   * @returns Promise resolving to submitted application
   */
  async submitApplication(applicationId: string): Promise<Application> {
    this.logger.debug('Submitting application', { applicationId });

    try {
      // Get application from cache or database
      let application = await this.getCachedApplication(applicationId);

      // Validate application can be submitted
      if (application.status !== ApplicationStatus.DRAFT) {
        throw new Error('Application can only be submitted from DRAFT status');
      }

      // Update application status
      application = await this.applicationRepository.updateStatus(
        applicationId,
        ApplicationStatus.SUBMITTED,
        application.version
      );

      // Start verification process with circuit breaker protection
      await this.circuitBreaker.fire(
        'startVerification',
        async () => {
          await this.verificationService.verifyDocuments(applicationId);
          await this.verificationService.performBackgroundCheck(applicationId);
        }
      );

      // Update cache with new status
      await this.cacheManager.set(
        `${this.CACHE_PREFIX}${applicationId}`,
        application,
        this.CACHE_TTL
      );

      this.logger.info('Application submitted successfully', {
        applicationId,
        status: application.status
      });

      return application;

    } catch (error) {
      this.logger.error('Failed to submit application', {
        error: error.message,
        applicationId
      });
      throw error;
    }
  }

  /**
   * Retrieves application status with caching
   * @param applicationId - Application identifier
   * @returns Promise resolving to application status
   */
  async getApplicationStatus(applicationId: string): Promise<ApplicationStatus> {
    this.logger.debug('Retrieving application status', { applicationId });

    try {
      const application = await this.getCachedApplication(applicationId);
      return application.status;

    } catch (error) {
      this.logger.error('Failed to get application status', {
        error: error.message,
        applicationId
      });
      throw error;
    }
  }

  /**
   * Updates application verification status with audit logging
   * @param applicationId - Application identifier
   * @param verificationStatus - New verification status
   * @returns Promise resolving to updated application
   */
  async updateVerificationStatus(
    applicationId: string,
    verificationStatus: VerificationStatus
  ): Promise<Application> {
    this.logger.debug('Updating verification status', {
      applicationId,
      verificationStatus
    });

    try {
      const application = await this.applicationRepository.updateVerificationStatus(
        applicationId,
        verificationStatus
      );

      // Update cache
      await this.cacheManager.set(
        `${this.CACHE_PREFIX}${applicationId}`,
        application,
        this.CACHE_TTL
      );

      this.logger.info('Verification status updated', {
        applicationId,
        verificationStatus
      });

      return application;

    } catch (error) {
      this.logger.error('Failed to update verification status', {
        error: error.message,
        applicationId
      });
      throw error;
    }
  }

  /**
   * Retrieves application from cache or falls back to database
   * @param applicationId - Application identifier
   * @returns Promise resolving to application
   */
  private async getCachedApplication(applicationId: string): Promise<Application> {
    const cacheKey = `${this.CACHE_PREFIX}${applicationId}`;
    
    // Try cache first
    const cached = await this.cacheManager.get<Application>(cacheKey);
    if (cached) {
      this.logger.debug('Retrieved application from cache', { applicationId });
      return cached;
    }

    // Fall back to database
    const application = await this.applicationRepository.findById(applicationId);
    
    // Cache for future requests
    await this.cacheManager.set(cacheKey, application, this.CACHE_TTL);
    
    return application;
  }
}