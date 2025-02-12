/**
 * Core notification model defining comprehensive interfaces and types for a scalable notification system.
 * Supports multi-channel delivery, tenant isolation, and granular status tracking.
 * @packageDocumentation
 */

import { Schema } from 'mongoose'; // v7.4.0
import { BaseEntity } from '@projectx/common';

/**
 * Supported notification channel types
 */
export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
  PUSH = 'PUSH'
}

/**
 * Granular notification delivery status tracking
 */
export enum NotificationStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED'
}

/**
 * Template variable definition for dynamic content
 */
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

/**
 * Template validation rule definition
 */
export interface ValidationRule {
  field: string;
  rule: string;
  message: string;
}

/**
 * Channel-specific notification content
 */
export interface NotificationContent {
  subject?: string;
  body: string;
  html?: string;
  data?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

/**
 * Channel preference configuration
 */
export interface ChannelPreference {
  type: NotificationType;
  enabled: boolean;
  priority: number;
}

/**
 * Delivery schedule configuration
 */
export interface DeliverySchedule {
  days: number[];
  startTime: string;
  endTime: string;
  timezone: string;
}

/**
 * Blackout period configuration
 */
export interface BlackoutPeriod {
  startDate: Date;
  endDate: Date;
  reason?: string;
}

/**
 * Category-specific notification preferences
 */
export interface CategoryPreference {
  category: string;
  enabled: boolean;
  channels: NotificationType[];
}

/**
 * Core notification interface extending BaseEntity
 */
export interface Notification extends BaseEntity {
  tenantId: string;
  type: NotificationType;
  userId: string;
  title: string;
  content: NotificationContent;
  templateId?: string;
  status: NotificationStatus;
  priority: number;
  metadata: Record<string, any>;
  retryCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
}

/**
 * Notification template interface extending BaseEntity
 */
export interface NotificationTemplate extends BaseEntity {
  tenantId: string;
  type: NotificationType;
  name: string;
  description: string;
  subject: string;
  template: string;
  version: number;
  variables: TemplateVariable[];
  isActive: boolean;
  validationRules: ValidationRule[];
}

/**
 * User notification preferences
 */
export interface NotificationPreference {
  userId: string;
  tenantId: string;
  channels: ChannelPreference[];
  schedules: DeliverySchedule[];
  blackoutPeriods: BlackoutPeriod[];
  categories: CategoryPreference[];
}

/**
 * Mongoose schema for Notification
 */
export const NotificationSchema = new Schema<Notification>({
  tenantId: { type: String, required: true, index: true },
  type: { type: String, enum: Object.values(NotificationType), required: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: {
    subject: String,
    body: { type: String, required: true },
    html: String,
    data: Schema.Types.Mixed,
    attachments: [{
      filename: String,
      content: String,
      contentType: String
    }]
  },
  templateId: { type: String, index: true },
  status: { 
    type: String, 
    enum: Object.values(NotificationStatus), 
    default: NotificationStatus.PENDING,
    index: true 
  },
  priority: { type: Number, default: 0, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  retryCount: { type: Number, default: 0 },
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  expiresAt: { type: Date, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'notifications'
});

/**
 * Mongoose schema for NotificationTemplate
 */
export const NotificationTemplateSchema = new Schema<NotificationTemplate>({
  tenantId: { type: String, required: true, index: true },
  type: { type: String, enum: Object.values(NotificationType), required: true },
  name: { type: String, required: true },
  description: String,
  subject: String,
  template: { type: String, required: true },
  version: { type: Number, default: 1 },
  variables: [{
    name: String,
    type: String,
    required: Boolean,
    defaultValue: Schema.Types.Mixed,
    description: String
  }],
  isActive: { type: Boolean, default: true, index: true },
  validationRules: [{
    field: String,
    rule: String,
    message: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'notification_templates'
});

/**
 * Mongoose schema for NotificationPreference
 */
export const NotificationPreferenceSchema = new Schema<NotificationPreference>({
  userId: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  channels: [{
    type: { type: String, enum: Object.values(NotificationType) },
    enabled: Boolean,
    priority: Number
  }],
  schedules: [{
    days: [Number],
    startTime: String,
    endTime: String,
    timezone: String
  }],
  blackoutPeriods: [{
    startDate: Date,
    endDate: Date,
    reason: String
  }],
  categories: [{
    category: String,
    enabled: Boolean,
    channels: [{ type: String, enum: Object.values(NotificationType) }]
  }]
}, {
  timestamps: true,
  collection: 'notification_preferences'
});

// Create indexes for performance optimization
NotificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, status: 1, priority: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

NotificationTemplateSchema.index({ tenantId: 1, name: 1, version: -1 });
NotificationPreferenceSchema.index({ userId: 1, tenantId: 1 }, { unique: true });