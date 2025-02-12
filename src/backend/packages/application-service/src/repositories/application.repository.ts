import { EntityRepository, Repository, QueryRunner } from 'typeorm'; // typeorm v0.3.17
import { Logger } from 'winston'; // winston v3.9.0
import { ConflictException, NotFoundException } from '@nestjs/common'; // @nestjs/common v9.0.0
import { Application, ApplicationStatus, VerificationStatus } from '../models/application.model';
import { BaseEntity } from '@common/interfaces';

/**
 * Repository class for managing rental application data persistence with
 * comprehensive error handling, logging, and transaction management
 */
@EntityRepository(Application)
export class ApplicationRepository extends Repository<Application> {
  private readonly logger: Logger;
  private readonly queryRunner: QueryRunner;

  constructor(logger: Logger, queryRunner: QueryRunner) {
    super();
    this.logger = logger;
    this.queryRunner = queryRunner;
  }

  /**
   * Creates a new rental application with transaction support and validation
   * @param applicationData - Data transfer object containing application details
   * @returns Promise resolving to the created application
   * @throws ConflictException if data validation fails
   */
  async createApplication(applicationData: Partial<Application>): Promise<Application> {
    this.logger.debug('Starting application creation transaction', { 
      applicantId: applicationData.applicantId,
      unitId: applicationData.unitId 
    });

    try {
      await this.queryRunner.startTransaction();

      const application = this.create({
        ...applicationData,
        status: ApplicationStatus.DRAFT,
        verificationStatus: VerificationStatus.PENDING,
        version: 1
      });

      const savedApplication = await this.queryRunner.manager.save(application);
      
      await this.queryRunner.commitTransaction();
      
      this.logger.info('Successfully created application', { 
        applicationId: savedApplication.id 
      });

      return savedApplication;

    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      
      this.logger.error('Failed to create application', {
        error: error.message,
        applicantId: applicationData.applicantId
      });
      
      throw new ConflictException('Failed to create application');
    }
  }

  /**
   * Retrieves an application by ID with optional relation loading
   * @param id - Application identifier
   * @param relations - Optional relations to eager load
   * @returns Promise resolving to found application
   * @throws NotFoundException if application doesn't exist
   */
  async findById(
    id: string, 
    relations: string[] = []
  ): Promise<Application> {
    this.logger.debug('Finding application by ID', { applicationId: id });

    const application = await this.findOne({
      where: { id },
      relations
    });

    if (!application) {
      this.logger.warn('Application not found', { applicationId: id });
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /**
   * Updates application status with optimistic locking
   * @param id - Application identifier
   * @param status - New application status
   * @param version - Current version for optimistic locking
   * @returns Promise resolving to updated application
   * @throws ConflictException on version mismatch
   */
  async updateStatus(
    id: string,
    status: ApplicationStatus,
    version: number
  ): Promise<Application> {
    this.logger.debug('Starting status update transaction', { 
      applicationId: id,
      newStatus: status 
    });

    try {
      await this.queryRunner.startTransaction();

      const application = await this.findOne({
        where: { id, version }
      });

      if (!application) {
        throw new ConflictException('Version mismatch or application not found');
      }

      application.status = status;
      application.version = version + 1;

      const updatedApplication = await this.queryRunner.manager.save(application);
      
      await this.queryRunner.commitTransaction();

      this.logger.info('Successfully updated application status', {
        applicationId: id,
        oldStatus: application.status,
        newStatus: status
      });

      return updatedApplication;

    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      
      this.logger.error('Failed to update application status', {
        error: error.message,
        applicationId: id
      });
      
      throw new ConflictException('Failed to update application status');
    }
  }

  /**
   * Updates application verification status with transaction support
   * @param id - Application identifier
   * @param verificationStatus - New verification status
   * @returns Promise resolving to updated application
   * @throws NotFoundException if application doesn't exist
   */
  async updateVerificationStatus(
    id: string,
    verificationStatus: VerificationStatus
  ): Promise<Application> {
    this.logger.debug('Starting verification status update', {
      applicationId: id,
      newStatus: verificationStatus
    });

    try {
      await this.queryRunner.startTransaction();

      const application = await this.findById(id);
      application.verificationStatus = verificationStatus;

      const updatedApplication = await this.queryRunner.manager.save(application);
      
      await this.queryRunner.commitTransaction();

      this.logger.info('Successfully updated verification status', {
        applicationId: id,
        newStatus: verificationStatus
      });

      return updatedApplication;

    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      
      this.logger.error('Failed to update verification status', {
        error: error.message,
        applicationId: id
      });
      
      throw new ConflictException('Failed to update verification status');
    }
  }

  /**
   * Finds all applications for a specific unit with pagination
   * @param unitId - Unit identifier
   * @param skip - Number of records to skip
   * @param take - Number of records to take
   * @returns Promise resolving to paginated applications
   */
  async findByUnitId(
    unitId: string,
    skip: number = 0,
    take: number = 10
  ): Promise<[Application[], number]> {
    this.logger.debug('Finding applications by unit ID', { 
      unitId,
      skip,
      take
    });

    try {
      return await this.findAndCount({
        where: { unitId },
        skip,
        take,
        order: { createdAt: 'DESC' }
      });

    } catch (error) {
      this.logger.error('Failed to fetch applications by unit', {
        error: error.message,
        unitId
      });
      throw error;
    }
  }
}