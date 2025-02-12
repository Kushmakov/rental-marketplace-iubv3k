import { Twilio, MessageInstance } from 'twilio'; // v4.14.0
import { Logger } from 'winston'; // v3.10.0
import { Counter, Histogram, Registry } from 'prom-client'; // v14.2.0
import { CircuitBreaker } from 'circuit-breaker-js'; // v0.0.1
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import { sms as smsConfig } from '../config';
import { NotificationType, NotificationStatus } from '../models/notification.model';

/**
 * Interface for SMS delivery result with detailed tracking
 */
interface SMSDeliveryResult {
  messageId: string;
  status: NotificationStatus;
  provider: string;
  timestamp: Date;
  meta: {
    to: string;
    from: string;
    cost?: number;
    segments?: number;
    errorCode?: string;
    errorMessage?: string;
  };
}

/**
 * Production-grade SMS service with comprehensive monitoring and reliability features
 */
export class SMSService {
  private readonly twilioClient: Twilio;
  private readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiterMemory;
  private readonly metrics: {
    smsAttempts: Counter;
    smsDelivered: Counter;
    smsFailed: Counter;
    smsLatency: Histogram;
  };

  constructor() {
    // Initialize Twilio client with retry capability
    this.twilioClient = new Twilio(
      smsConfig.accountSid,
      smsConfig.authToken,
      {
        timeout: 30000,
        keepAlive: true,
        keepAliveTimeout: 90000,
      }
    );

    // Configure structured logging
    this.logger = new Logger({
      level: 'info',
      format: Logger.format.combine(
        Logger.format.timestamp(),
        Logger.format.json()
      ),
      defaultMeta: { service: 'sms-service' }
    });

    // Initialize circuit breaker for fault tolerance
    this.circuitBreaker = new CircuitBreaker({
      windowDuration: 60000,
      numBuckets: 10,
      timeoutDuration: 30000,
      errorThreshold: 50,
      volumeThreshold: 10
    });

    // Configure rate limiter
    this.rateLimiter = new RateLimiterMemory({
      points: 100,
      duration: 60,
      blockDuration: 60
    });

    // Initialize Prometheus metrics
    const register = new Registry();
    this.metrics = {
      smsAttempts: new Counter({
        name: 'sms_send_attempts_total',
        help: 'Total number of SMS send attempts',
        labelNames: ['status']
      }),
      smsDelivered: new Counter({
        name: 'sms_delivered_total',
        help: 'Total number of SMS messages delivered'
      }),
      smsFailed: new Counter({
        name: 'sms_failed_total',
        help: 'Total number of SMS delivery failures',
        labelNames: ['error_type']
      }),
      smsLatency: new Histogram({
        name: 'sms_send_duration_seconds',
        help: 'SMS send duration in seconds',
        buckets: [0.1, 0.5, 1, 2, 5]
      })
    };
    register.registerMetric(this.metrics.smsAttempts);
    register.registerMetric(this.metrics.smsDelivered);
    register.registerMetric(this.metrics.smsFailed);
    register.registerMetric(this.metrics.smsLatency);
  }

  /**
   * Sends an SMS message with comprehensive error handling and monitoring
   */
  public async sendSMS(
    phoneNumber: string,
    message: string,
    options: {
      correlationId?: string;
      priority?: number;
      retryCount?: number;
    } = {}
  ): Promise<SMSDeliveryResult> {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    try {
      // Validate phone number format
      if (!this.isValidPhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number format');
      }

      // Check rate limits
      await this.rateLimiter.consume(phoneNumber);

      // Validate message length
      if (!this.isValidMessageLength(message)) {
        throw new Error('Message exceeds maximum length');
      }

      this.metrics.smsAttempts.inc({ status: 'attempt' });

      // Send SMS through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        const twilioMessage = await this.twilioClient.messages.create({
          to: phoneNumber,
          from: smsConfig.fromNumber,
          body: message,
          statusCallback: `${process.env.SERVICE_URL}/webhooks/sms/status`
        });

        return this.mapTwilioResponse(twilioMessage);
      });

      // Record success metrics
      this.metrics.smsDelivered.inc();
      this.metrics.smsLatency.observe((Date.now() - startTime) / 1000);

      this.logger.info('SMS sent successfully', {
        correlationId,
        messageId: result.messageId,
        to: phoneNumber,
        status: result.status
      });

      return result;

    } catch (error) {
      // Handle different error types
      const errorResult = this.handleSMSError(error, phoneNumber, correlationId);
      
      // Record error metrics
      this.metrics.smsFailed.inc({ error_type: errorResult.meta.errorCode });
      this.metrics.smsLatency.observe((Date.now() - startTime) / 1000);

      // Retry logic for retriable errors
      if (this.isRetriableError(error) && (options.retryCount || 0) < smsConfig.retryConfig.attempts) {
        return this.handleRetry(phoneNumber, message, {
          ...options,
          retryCount: (options.retryCount || 0) + 1
        });
      }

      return errorResult;
    }
  }

  /**
   * Sends a templated SMS with variable substitution
   */
  public async sendTemplatedSMS(
    phoneNumber: string,
    templateName: string,
    variables: Record<string, string>,
    options: {
      correlationId?: string;
      priority?: number;
    } = {}
  ): Promise<SMSDeliveryResult> {
    // Validate template exists
    const template = smsConfig.messageTemplates[templateName];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Process template with variables
    const message = this.processTemplate(template, variables);

    return this.sendSMS(phoneNumber, message, options);
  }

  /**
   * Handles Twilio delivery status webhooks
   */
  public async handleDeliveryWebhook(webhookData: any): Promise<void> {
    const { MessageSid, MessageStatus, ErrorCode } = webhookData;

    this.logger.info('SMS status update received', {
      messageId: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode
    });

    // Update metrics based on status
    if (MessageStatus === 'delivered') {
      this.metrics.smsDelivered.inc();
    } else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      this.metrics.smsFailed.inc({ error_type: ErrorCode || 'unknown' });
    }
  }

  /**
   * Retrieves current delivery status for a message
   */
  public async getDeliveryStatus(messageId: string): Promise<SMSDeliveryResult> {
    try {
      const message = await this.twilioClient.messages(messageId).fetch();
      return this.mapTwilioResponse(message);
    } catch (error) {
      this.logger.error('Error fetching message status', {
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  private isValidPhoneNumber(phoneNumber: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
  }

  private isValidMessageLength(message: string): boolean {
    return message.length <= 1600; // Twilio's maximum length
  }

  private isRetriableError(error: any): boolean {
    const retriableErrors = ['timeout', 'network_error', 'rate_limit_exceeded'];
    return retriableErrors.includes(error.code);
  }

  private async handleRetry(
    phoneNumber: string,
    message: string,
    options: any
  ): Promise<SMSDeliveryResult> {
    const backoffMs = Math.pow(2, options.retryCount) * 1000;
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    return this.sendSMS(phoneNumber, message, options);
  }

  private processTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!variables[key]) {
        throw new Error(`Missing required template variable: ${key}`);
      }
      return variables[key];
    });
  }

  private mapTwilioResponse(message: MessageInstance): SMSDeliveryResult {
    return {
      messageId: message.sid,
      status: this.mapTwilioStatus(message.status),
      provider: 'twilio',
      timestamp: new Date(message.dateCreated),
      meta: {
        to: message.to,
        from: message.from,
        cost: parseFloat(message.price || '0'),
        segments: message.numSegments,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      }
    };
  }

  private mapTwilioStatus(twilioStatus: string): NotificationStatus {
    const statusMap: Record<string, NotificationStatus> = {
      queued: NotificationStatus.QUEUED,
      sending: NotificationStatus.PENDING,
      sent: NotificationStatus.SENT,
      delivered: NotificationStatus.DELIVERED,
      failed: NotificationStatus.FAILED,
      undelivered: NotificationStatus.UNDELIVERABLE
    };
    return statusMap[twilioStatus] || NotificationStatus.PENDING;
  }

  private handleSMSError(
    error: any,
    phoneNumber: string,
    correlationId: string
  ): SMSDeliveryResult {
    this.logger.error('SMS send error', {
      correlationId,
      to: phoneNumber,
      error: error.message,
      code: error.code
    });

    return {
      messageId: '',
      status: NotificationStatus.FAILED,
      provider: 'twilio',
      timestamp: new Date(),
      meta: {
        to: phoneNumber,
        from: smsConfig.fromNumber,
        errorCode: error.code || 'unknown_error',
        errorMessage: error.message
      }
    };
  }
}