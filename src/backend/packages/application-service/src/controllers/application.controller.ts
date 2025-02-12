import { 
  Controller, 
  Post, 
  Get, 
  Put, 
  Body, 
  Param, 
  UseGuards, 
  UseInterceptors,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ConflictException
} from '@nestjs/common'; // @nestjs/common v10.0.0
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody,
  ApiBearerAuth,
  ApiParam 
} from '@nestjs/swagger'; // @nestjs/swagger v7.1.0
import { RateLimit } from '@nestjs/throttler'; // @nestjs/throttler v5.0.0
import { JwtAuthGuard } from '@nestjs/jwt'; // @nestjs/jwt v10.1.0

import { ApplicationService } from '../services/application.service';
import { Application, ApplicationStatus, VerificationStatus } from '../models/application.model';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { UpdateApplicationStatusDto } from '../dto/update-application-status.dto';

/**
 * Controller handling rental application HTTP endpoints with comprehensive
 * validation, security, and monitoring capabilities
 */
@Controller('applications')
@ApiTags('applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor, TransformInterceptor)
export class ApplicationController {
  private readonly logger = new Logger(ApplicationController.name);

  constructor(private readonly applicationService: ApplicationService) {}

  /**
   * Creates a new rental application with validation
   * @param createApplicationDto - Application creation data transfer object
   * @returns Promise resolving to created application
   */
  @Post()
  @ApiOperation({ summary: 'Create new rental application' })
  @ApiBody({ type: CreateApplicationDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Application created successfully',
    type: Application 
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createApplication(
    @Body() createApplicationDto: CreateApplicationDto
  ): Promise<Application> {
    this.logger.debug('Creating new application', { 
      applicantId: createApplicationDto.applicantId,
      unitId: createApplicationDto.unitId 
    });

    try {
      const application = await this.applicationService.createApplication(createApplicationDto);
      
      this.logger.log('Application created successfully', { 
        applicationId: application.id 
      });
      
      return application;

    } catch (error) {
      this.logger.error('Failed to create application', {
        error: error.message,
        applicantId: createApplicationDto.applicantId
      });
      
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException('Failed to create application');
    }
  }

  /**
   * Submits an application for processing with rate limiting
   * @param id - Application identifier
   * @returns Promise resolving to submitted application
   */
  @Post(':id/submit')
  @RateLimit({ points: 5, duration: 60 })
  @ApiOperation({ summary: 'Submit application for processing' })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Application submitted successfully',
    type: Application 
  })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async submitApplication(
    @Param('id') id: string
  ): Promise<Application> {
    this.logger.debug('Submitting application', { applicationId: id });

    try {
      const application = await this.applicationService.submitApplication(id);
      
      this.logger.log('Application submitted successfully', {
        applicationId: id,
        status: application.status
      });
      
      return application;

    } catch (error) {
      this.logger.error('Failed to submit application', {
        error: error.message,
        applicationId: id
      });
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to submit application');
    }
  }

  /**
   * Retrieves application by ID with caching
   * @param id - Application identifier
   * @returns Promise resolving to application details
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get application by ID' })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Application retrieved successfully',
    type: Application 
  })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getApplication(
    @Param('id') id: string
  ): Promise<Application> {
    this.logger.debug('Retrieving application', { applicationId: id });

    try {
      const application = await this.applicationService.getApplicationById(id);
      
      this.logger.log('Application retrieved successfully', { 
        applicationId: id 
      });
      
      return application;

    } catch (error) {
      this.logger.error('Failed to retrieve application', {
        error: error.message,
        applicationId: id
      });
      
      throw new NotFoundException('Application not found');
    }
  }

  /**
   * Updates application status with validation and audit logging
   * @param id - Application identifier
   * @param updateStatusDto - Status update data transfer object
   * @returns Promise resolving to updated application
   */
  @Put(':id/status')
  @ApiOperation({ summary: 'Update application status' })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiBody({ type: UpdateApplicationStatusDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Status updated successfully',
    type: Application 
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateApplicationStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateApplicationStatusDto
  ): Promise<Application> {
    this.logger.debug('Updating application status', {
      applicationId: id,
      newStatus: updateStatusDto.status
    });

    try {
      const application = await this.applicationService.updateApplicationStatus(
        id,
        updateStatusDto.status
      );
      
      this.logger.log('Application status updated successfully', {
        applicationId: id,
        oldStatus: application.status,
        newStatus: updateStatusDto.status
      });
      
      return application;

    } catch (error) {
      this.logger.error('Failed to update application status', {
        error: error.message,
        applicationId: id
      });
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Invalid status transition');
    }
  }
}