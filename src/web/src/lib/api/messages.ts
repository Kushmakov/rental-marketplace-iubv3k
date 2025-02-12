// @package zod@3.22.0
// @package socket.io-client@4.7.0
// @package crypto-js@4.1.1

import { z } from 'zod';
import { io, Socket } from 'socket.io-client';
import CryptoJS from 'crypto-js';
import axiosInstance from '../axios';
import { Message, MessageThread, MessageType, MessageStatus, MessageFilters } from '../../types/message';

// Validation schemas for message content
const messageContentSchema = z.object({
  content: z.string().min(1).max(5000),
  type: z.nativeEnum(MessageType),
  attachments: z.array(z.object({
    type: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'application/docx']),
    name: z.string(),
    size: z.number().max(10 * 1024 * 1024) // 10MB max
  })).optional(),
  replyTo: z.string().optional()
});

// Pagination options type
interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
}

// Response type with pagination
interface PaginatedResponse<T> {
  data: T;
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    nextCursor?: string;
  };
}

/**
 * Retrieves message threads for the current user with pagination
 * @param options - Pagination options
 * @returns Promise with paginated message threads
 */
export const getMessageThreads = async (
  options: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResponse<MessageThread[]>> => {
  const response = await axiosInstance.get('/messages/threads', {
    params: {
      page: options.page,
      limit: options.limit,
      cursor: options.cursor
    }
  });

  return response.data;
};

/**
 * Retrieves messages for a specific thread with filtering
 * @param filters - Message filtering options
 * @returns Promise with filtered messages
 */
export const getMessages = async (
  filters: MessageFilters
): Promise<PaginatedResponse<Message[]>> => {
  const response = await axiosInstance.get('/messages', {
    params: filters
  });

  return response.data;
};

/**
 * Sends a new message with content validation and encryption
 * @param threadId - Target thread ID
 * @param messageData - Message content and metadata
 * @returns Promise with created message
 */
export const sendMessage = async (
  threadId: string,
  messageData: z.infer<typeof messageContentSchema>
): Promise<Message> => {
  // Validate message content
  const validatedData = messageContentSchema.parse(messageData);

  // Encrypt sensitive content
  const encryptedContent = CryptoJS.AES.encrypt(
    validatedData.content,
    process.env.NEXT_PUBLIC_MESSAGE_ENCRYPTION_KEY || ''
  ).toString();

  // Handle attachments if present
  let attachments = [];
  if (validatedData.attachments?.length) {
    attachments = await Promise.all(
      validatedData.attachments.map(async (attachment) => {
        const formData = new FormData();
        formData.append('file', attachment as unknown as File);
        
        const uploadResponse = await axiosInstance.post('/messages/attachments', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        return uploadResponse.data;
      })
    );
  }

  // Send message
  const response = await axiosInstance.post('/messages', {
    threadId,
    content: encryptedContent,
    type: validatedData.type,
    attachments,
    replyTo: validatedData.replyTo,
    encryptionStatus: 'ENCRYPTED'
  });

  return response.data;
};

/**
 * Updates message status (read/delivered)
 * @param messageId - ID of the message to update
 * @param status - New message status
 */
export const updateMessageStatus = async (
  messageId: string,
  status: MessageStatus
): Promise<void> => {
  await axiosInstance.put(`/messages/${messageId}/status`, { status });
};

/**
 * MessageManager class for handling real-time message updates
 */
export class MessageManager {
  private socket: Socket;
  private messageQueue: Map<string, Message>;
  private encryptionKey: string;

  constructor(options: { url: string; autoConnect?: boolean } = { url: '', autoConnect: true }) {
    this.encryptionKey = process.env.NEXT_PUBLIC_MESSAGE_ENCRYPTION_KEY || '';
    this.messageQueue = new Map();
    
    this.socket = io(options.url, {
      autoConnect: options.autoConnect,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.initializeSocketListeners();
  }

  /**
   * Initialize socket event listeners
   */
  private initializeSocketListeners(): void {
    this.socket.on('message:new', this.handleMessageUpdate.bind(this));
    this.socket.on('message:status', this.handleStatusUpdate.bind(this));
    this.socket.on('disconnect', () => {
      console.warn('Disconnected from message server');
    });
  }

  /**
   * Handle incoming message updates
   * @param event - Message event data
   */
  public handleMessageUpdate(event: { message: Message }): void {
    try {
      // Decrypt message content if encrypted
      if (event.message.encryptionStatus === 'ENCRYPTED') {
        const decryptedContent = CryptoJS.AES.decrypt(
          event.message.content,
          this.encryptionKey
        ).toString(CryptoJS.enc.Utf8);

        event.message.content = decryptedContent;
        event.message.encryptionStatus = 'DECRYPTED';
      }

      // Update message queue
      this.messageQueue.set(event.message.id, event.message);

      // Emit event for UI updates
      this.emit('messageUpdated', event.message);
    } catch (error) {
      console.error('Error processing message update:', error);
    }
  }

  /**
   * Handle message status updates
   * @param event - Status update event
   */
  private handleStatusUpdate(event: { messageId: string; status: MessageStatus }): void {
    const message = this.messageQueue.get(event.messageId);
    if (message) {
      message.status = event.status;
      this.messageQueue.set(event.messageId, message);
      this.emit('statusUpdated', { messageId: event.messageId, status: event.status });
    }
  }

  /**
   * Connect to message server
   */
  public connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  /**
   * Disconnect from message server
   */
  public disconnect(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  /**
   * Emit custom events
   * @param event - Event name
   * @param data - Event data
   */
  private emit(event: string, data: unknown): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(event, { detail: data }));
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.disconnect();
    this.messageQueue.clear();
  }
}