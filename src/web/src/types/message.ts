import { User } from '../types/auth';

/**
 * Enumeration of supported message content types
 * Defines the various types of messages that can be sent through the system
 */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  SYSTEM = 'SYSTEM'
}

/**
 * Enumeration of message delivery statuses
 * Tracks the state of message delivery and reading
 */
export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ'
}

/**
 * Interface for message attachments like images and documents
 * Defines structure for files attached to messages with size limits
 */
export interface MessageAttachment {
  readonly id: string;
  type: 'image/jpeg' | 'image/png' | 'application/pdf' | 'application/docx';
  url: string;
  name: string;
  size: number;
  readonly maxSize: number;
}

/**
 * Core message interface defining structure of message records
 * Represents individual messages within the messaging system
 */
export interface Message {
  readonly id: string;
  readonly threadId: string;
  readonly senderId: string;
  type: MessageType;
  content: string;
  attachments: readonly MessageAttachment[];
  status: MessageStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  replyTo?: string;
  metadata: Record<string, unknown>;
  systemData?: Record<string, unknown>;
  encryptionStatus: 'ENCRYPTED' | 'DECRYPTED' | 'NONE';
}

/**
 * Interface for message threads between users
 * Manages conversations between participants with metadata
 */
export interface MessageThread {
  readonly id: string;
  type: 'DIRECT' | 'GROUP';
  participants: readonly string[];
  participantDetails: readonly Array<Pick<User, 'id' | 'firstName' | 'lastName'>>;
  lastMessage: Message;
  unreadCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Interface for filtering messages in queries
 * Provides parameters for message search and pagination
 */
export interface MessageFilters {
  threadId: string;
  type: MessageType[];
  startDate: string;
  endDate: string;
  cursor: string;
  limit: number;
}