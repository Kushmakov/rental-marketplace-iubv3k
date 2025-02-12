import { Model, ClientSession } from 'mongoose'; // v7.4.0
import { Logger } from '@projectx/common';
import { 
  Notification, 
  NotificationTemplate, 
  NotificationPreference,
  NotificationStatus,
  NotificationType
} from '../models/notification.model';

/**
 * Delivery metrics for enhanced notification tracking
 */
interface DeliveryMetrics {
  attempts: number;
  latency: number;
  provider: string;
  metadata: Record<string, any>;
}

/**
 * Repository class for managing notification persistence with comprehensive features
 * including multi-tenancy, templating, and advanced delivery tracking.
 */
export class NotificationRepository {
  constructor(
    private readonly notificationModel: Model<Notification>,
    private readonly templateModel: Model<NotificationTemplate>,
    private readonly preferenceModel: Model<NotificationPreference>,
    private readonly logger: Logger
  ) {
    this.setupIndexes();
  }

  /**
   * Sets up performance and maintenance indexes
   */
  private async setupIndexes(): Promise<void> {
    try {
      // Compound indexes for efficient querying
      await this.notificationModel.collection.createIndex(
        { tenantId: 1, status: 1, priority: -1 },
        { background: true }
      );

      // TTL index for notification expiration
      await this.notificationModel.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
      );

      // Compound index for user notifications
      await this.notificationModel.collection.createIndex(
        { tenantId: 1, userId: 1, createdAt: -1 },
        { background: true }
      );

      this.logger.info('Notification repository indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create notification repository indexes', error);
      throw error;
    }
  }

  /**
   * Creates multiple notifications efficiently in a single transaction
   */
  async createNotificationBatch(
    notifications: Omit<Notification, 'id' | 'createdAt' | 'updatedAt'>[],
    tenantId: string
  ): Promise<Notification[]> {
    const session = await this.notificationModel.startSession();
    
    try {
      session.startTransaction();

      // Validate tenant access and notification data
      notifications.forEach(notification => {
        if (notification.tenantId !== tenantId) {
          throw new Error('Invalid tenant ID in notification batch');
        }
      });

      // Create notifications in batch
      const createdNotifications = await this.notificationModel.create(
        notifications.map(notification => ({
          ...notification,
          status: NotificationStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        })),
        { session }
      );

      await session.commitTransaction();
      return createdNotifications;

    } catch (error) {
      await session.abortTransaction();
      this.logger.error('Failed to create notification batch', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Updates notification status with comprehensive delivery tracking
   */
  async updateNotificationStatusWithTracking(
    id: string,
    status: NotificationStatus,
    metrics: DeliveryMetrics
  ): Promise<Notification> {
    const notification = await this.notificationModel.findById(id);
    
    if (!notification) {
      throw new Error(`Notification not found: ${id}`);
    }

    const statusUpdate: Partial<Notification> = {
      status,
      updatedAt: new Date(),
      metadata: {
        ...notification.metadata,
        deliveryMetrics: metrics
      }
    };

    // Update status-specific timestamps
    if (status === NotificationStatus.SENT) {
      statusUpdate.sentAt = new Date();
    } else if (status === NotificationStatus.DELIVERED) {
      statusUpdate.deliveredAt = new Date();
    } else if (status === NotificationStatus.READ) {
      statusUpdate.readAt = new Date();
    }

    // Update retry count for failed deliveries
    if (status === NotificationStatus.FAILED) {
      statusUpdate.retryCount = (notification.retryCount || 0) + 1;
    }

    const updatedNotification = await this.notificationModel.findByIdAndUpdate(
      id,
      { $set: statusUpdate },
      { new: true }
    );

    if (!updatedNotification) {
      throw new Error(`Failed to update notification status: ${id}`);
    }

    return updatedNotification;
  }

  /**
   * Retrieves notifications by tenant with advanced filtering
   */
  async findByTenant(
    tenantId: string,
    filters: {
      status?: NotificationStatus[];
      type?: NotificationType[];
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page: number = 1,
    limit: number = 50
  ): Promise<{ notifications: Notification[]; total: number }> {
    const query: any = { tenantId };

    if (filters.status?.length) {
      query.status = { $in: filters.status };
    }
    if (filters.type?.length) {
      query.type = { $in: filters.type };
    }
    if (filters.userId) {
      query.userId = filters.userId;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(query)
    ]);

    return { notifications, total };
  }

  /**
   * Marks expired notifications and updates their status
   */
  async processExpiredNotifications(): Promise<number> {
    const result = await this.notificationModel.updateMany(
      {
        expiresAt: { $lt: new Date() },
        status: {
          $in: [
            NotificationStatus.PENDING,
            NotificationStatus.QUEUED,
            NotificationStatus.SENDING
          ]
        }
      },
      {
        $set: {
          status: NotificationStatus.FAILED,
          metadata: {
            expirationReason: 'Notification expired before delivery'
          }
        }
      }
    );

    return result.modifiedCount;
  }
}