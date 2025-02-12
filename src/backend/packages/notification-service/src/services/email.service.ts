import { mail as SendGridMail } from '@sendgrid/mail'; // v7.7.0
import { Logger } from 'winston'; // v3.10.0
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import { EmailAnalytics } from '@sendgrid/analytics'; // v1.0.0
import { NotificationRepository } from '../repositories/notification.repository';
import { email as emailConfig, templateConfig, rateLimits } from '../config';
import { NotificationStatus, NotificationType } from '../models/notification.model';

/**
 * Interface for email tracking metrics
 */
interface EmailMetrics {
  messageId: string;
  deliveryLatency: number;
  openRate?: number;
  clickRate?: number;
  bounceType?: string;
}

/**
 * Interface for email template data
 */
interface TemplateData {
  templateId: string;
  version: string;
  dynamicData: Record<string, any>;
}

/**
 * Enhanced email service with comprehensive features including template management,
 * delivery tracking, analytics, and multi-tenant support
 */
export class EmailService {
  private readonly logger: Logger;
  private readonly rateLimiter: RateLimiter;
  private readonly templateVersions: Map<string, string>;

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly emailAnalytics: EmailAnalytics
  ) {
    // Initialize SendGrid client
    SendGridMail.setApiKey(emailConfig.apiKey);
    
    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      points: rateLimits.email.maxPerMinute,
      duration: 60,
      blockDuration: 60
    });

    // Initialize template version cache
    this.templateVersions = new Map();

    // Initialize logger with correlation ID support
    this.logger = new Logger({
      level: 'info',
      format: Logger.format.combine(
        Logger.format.timestamp(),
        Logger.format.json()
      )
    });

    // Setup bounce handling webhook
    this.setupBounceHandling();
  }

  /**
   * Sends an email with comprehensive tracking and analytics
   */
  public async sendEmail(
    to: string,
    subject: string,
    templateId: string,
    dynamicData: Record<string, any>,
    tenantId: string
  ): Promise<void> {
    try {
      // Check rate limit for tenant
      await this.checkRateLimit(tenantId);

      // Validate email parameters
      this.validateEmailParams(to, subject, templateId, dynamicData);

      // Get latest template version
      const templateVersion = await this.getTemplateVersion(templateId);

      // Prepare email with tracking
      const emailData = {
        to,
        from: emailConfig.fromEmail,
        subject,
        templateId,
        dynamicTemplateData: {
          ...dynamicData,
          tracking_id: this.generateTrackingId(),
          tenant_id: tenantId
        },
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
          subscriptionTracking: { enable: false }
        },
        customArgs: {
          tenant_id: tenantId,
          template_version: templateVersion
        }
      };

      // Send email with retry mechanism
      const startTime = Date.now();
      const response = await this.sendWithRetry(emailData);

      // Track delivery metrics
      const metrics: EmailMetrics = {
        messageId: response.messageId,
        deliveryLatency: Date.now() - startTime
      };

      // Update notification status
      await this.notificationRepository.updateNotificationStatusWithTracking(
        response.messageId,
        NotificationStatus.SENT,
        {
          attempts: 1,
          latency: metrics.deliveryLatency,
          provider: 'sendgrid',
          metadata: metrics
        }
      );

      // Update analytics
      await this.emailAnalytics.trackDelivery({
        messageId: response.messageId,
        tenantId,
        templateId,
        metrics
      });

      this.logger.info('Email sent successfully', {
        messageId: response.messageId,
        tenantId,
        templateId
      });

    } catch (error) {
      this.logger.error('Failed to send email', {
        error,
        to,
        templateId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Validates email sending rate limits for tenant
   */
  private async checkRateLimit(tenantId: string): Promise<void> {
    try {
      await this.rateLimiter.consume(tenantId);
    } catch (error) {
      throw new Error(`Rate limit exceeded for tenant: ${tenantId}`);
    }
  }

  /**
   * Validates email parameters and template data
   */
  private validateEmailParams(
    to: string,
    subject: string,
    templateId: string,
    dynamicData: Record<string, any>
  ): void {
    if (!to || !to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid recipient email address');
    }

    if (!subject || subject.length === 0) {
      throw new Error('Email subject is required');
    }

    if (!templateId || !templateConfig.templates[templateId]) {
      throw new Error('Invalid template ID');
    }

    const template = templateConfig.templates[templateId];
    const missingVars = template.requiredVariables.filter(
      variable => !dynamicData.hasOwnProperty(variable)
    );

    if (missingVars.length > 0) {
      throw new Error(`Missing required template variables: ${missingVars.join(', ')}`);
    }
  }

  /**
   * Retrieves and caches template versions
   */
  private async getTemplateVersion(templateId: string): Promise<string> {
    if (!this.templateVersions.has(templateId)) {
      const template = await SendGridMail.getTemplate(templateId);
      this.templateVersions.set(templateId, template.version);
    }
    return this.templateVersions.get(templateId)!;
  }

  /**
   * Sends email with retry mechanism
   */
  private async sendWithRetry(emailData: any, attempts: number = 3): Promise<any> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await SendGridMail.send(emailData);
      } catch (error: any) {
        if (i === attempts - 1 || !this.isRetryableError(error)) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(error.code) || error.message.includes('timeout');
  }

  /**
   * Generates unique tracking ID for email
   */
  private generateTrackingId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sets up bounce handling webhook
   */
  private setupBounceHandling(): void {
    // Configure bounce webhook endpoint
    SendGridMail.setupWebhook({
      enabled: true,
      url: `${emailConfig.webhookBaseUrl}/bounces`,
      events: ['bounce', 'dropped', 'spamreport']
    });
  }

  /**
   * Handles email bounce events
   */
  public async handleBounce(event: any): Promise<void> {
    const { messageId, reason, type } = event;

    await this.notificationRepository.updateNotificationStatusWithTracking(
      messageId,
      NotificationStatus.BOUNCED,
      {
        attempts: 1,
        latency: 0,
        provider: 'sendgrid',
        metadata: { reason, type }
      }
    );

    await this.emailAnalytics.trackBounce({
      messageId,
      reason,
      type
    });

    this.logger.warn('Email bounce received', { messageId, reason, type });
  }
}