/**
 * Type definitions for the notification system
 * Supports comprehensive notification management including delivery channels,
 * status tracking, templates, and user preferences
 * @version 1.0.0
 */

/**
 * Supported notification delivery channels
 */
export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
  PUSH = 'PUSH'
}

/**
 * Notification delivery status tracking
 */
export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

/**
 * Notification priority levels for delivery optimization
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * Structured notification content with templating support
 */
export interface NotificationContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
  templateId: string;
  templateVariables: Record<string, string | number | boolean>;
  localeCode: string;
}

/**
 * Core notification interface with comprehensive tracking
 */
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  userId: string;
  content: NotificationContent;
  status: NotificationStatus;
  version: number;
  expiresAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Notification template definition with variable validation
 */
export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  name: string;
  description: string;
  subject: string;
  template: string;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
  }>;
  version: number;
  active: boolean;
}

/**
 * User notification preferences with granular channel control
 */
export interface NotificationPreference {
  userId: string;
  channels: Record<NotificationType, boolean>;
  scheduleEnabled: boolean;
  quietHours: {
    start: string; // 24-hour format HH:mm
    end: string; // 24-hour format HH:mm
  };
  timezone: string;
  categories: Record<string, {
    enabled: boolean;
    channels: NotificationType[];
  }>;
}

/**
 * Advanced notification filtering and pagination interface
 */
export interface NotificationFilter {
  types: NotificationType[];
  statuses: NotificationStatus[];
  priorities: NotificationPriority[];
  dateRange: {
    start: Date;
    end: Date;
  };
  read: boolean;
  search: string;
  pagination: {
    page: number;
    limit: number;
  };
  sort: {
    field: string;
    order: 'asc' | 'desc';
  };
}