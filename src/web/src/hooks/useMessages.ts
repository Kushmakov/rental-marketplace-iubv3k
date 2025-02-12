// @react-redux@8.1.0
// @react@18.2.0
// @react-use-websocket@4.3.1
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect, useCallback } from 'react';
import useWebSocket from 'react-use-websocket';
import { 
  Message, 
  MessageThread, 
  MessageType, 
  MessageStatus,
  MessageFilters 
} from '../../types/message';
import { 
  selectThreads, 
  selectThreadMessages, 
  selectThreadLoadingState,
  fetchMessageThreads,
  sendMessage,
  updateMessageStatus,
  clearMessageError,
  markThreadAsRead 
} from '../../store/slices/messageSlice';

// WebSocket configuration
const WS_URL = process.env.REACT_APP_WS_URL || 'wss://api.projectx.com/messages';
const WS_RETRY_INTERVAL = 3000;
const MAX_RETRIES = 5;

interface MessageError {
  code: string;
  message: string;
}

interface MessageOptions {
  enableEncryption?: boolean;
  enableOfflineSupport?: boolean;
  enableTypingIndicators?: boolean;
  enableReadReceipts?: boolean;
}

interface TypingStatus {
  threadId: string;
  userId: string;
  isTyping: boolean;
}

export function useMessages(
  filters: MessageFilters,
  options: MessageOptions = {}
) {
  const dispatch = useDispatch();
  const threads = useSelector(selectThreads);
  const currentThread = useSelector((state) => 
    filters.threadId ? selectThreadMessages(state, filters.threadId) : null
  );
  const loadingState = useSelector(selectThreadLoadingState);

  // Local state management
  const [error, setError] = useState<MessageError | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [retryQueue, setRetryQueue] = useState<Message[]>([]);
  const [draftMessages, setDraftMessages] = useState<Record<string, string>>({});

  // WebSocket connection with retry logic
  const { 
    sendMessage: sendWebSocketMessage,
    lastMessage,
    readyState 
  } = useWebSocket(WS_URL, {
    retryOnError: true,
    reconnectInterval: WS_RETRY_INTERVAL,
    reconnectAttempts: MAX_RETRIES,
    onOpen: () => {
      console.log('WebSocket connected');
      processRetryQueue();
    },
    onClose: () => {
      console.log('WebSocket disconnected');
    },
    onError: (event) => {
      setError({ code: 'WS_ERROR', message: 'WebSocket connection error' });
    }
  });

  // Process messages from WebSocket
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        switch (data.type) {
          case 'NEW_MESSAGE':
            handleNewMessage(data.payload);
            break;
          case 'MESSAGE_STATUS':
            handleMessageStatus(data.payload);
            break;
          case 'TYPING_INDICATOR':
            handleTypingIndicator(data.payload);
            break;
          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (err) {
        setError({ code: 'WS_PARSE_ERROR', message: 'Failed to parse WebSocket message' });
      }
    }
  }, [lastMessage]);

  // Offline support
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Process retry queue when coming back online
  const processRetryQueue = useCallback(async () => {
    if (retryQueue.length > 0 && !isOffline) {
      for (const message of retryQueue) {
        try {
          await dispatch(sendMessage({
            content: message.content,
            threadId: message.threadId,
            type: message.type,
            metadata: message.metadata
          }));
        } catch (err) {
          console.error('Failed to retry message:', err);
        }
      }
      setRetryQueue([]);
    }
  }, [retryQueue, isOffline, dispatch]);

  // Send message with retry support
  const sendMessageWithRetry = useCallback(async (
    content: string,
    threadId: string,
    type: MessageType = MessageType.TEXT,
    attachments?: File[],
    metadata?: Record<string, unknown>
  ) => {
    try {
      if (isOffline && options.enableOfflineSupport) {
        const offlineMessage = {
          content,
          threadId,
          type,
          metadata,
          status: MessageStatus.SENT,
          createdAt: new Date().toISOString()
        } as Message;
        
        setRetryQueue(prev => [...prev, offlineMessage]);
        return;
      }

      await dispatch(sendMessage({
        content,
        threadId,
        type,
        attachments,
        metadata
      }));
    } catch (err) {
      setError({ code: 'SEND_ERROR', message: 'Failed to send message' });
    }
  }, [dispatch, isOffline, options.enableOfflineSupport]);

  // Typing indicator management
  const setTypingStatus = useCallback((threadId: string, isTyping: boolean) => {
    if (options.enableTypingIndicators && readyState === WebSocket.OPEN) {
      sendWebSocketMessage(JSON.stringify({
        type: 'TYPING_INDICATOR',
        payload: { threadId, isTyping }
      }));
    }
  }, [options.enableTypingIndicators, readyState, sendWebSocketMessage]);

  // Draft message management
  const saveDraft = useCallback((threadId: string, content: string) => {
    setDraftMessages(prev => ({
      ...prev,
      [threadId]: content
    }));
  }, []);

  // Thread management
  const fetchThread = useCallback(async (threadId: string) => {
    try {
      await dispatch(fetchMessageThreads({ 
        page: 1, 
        limit: 50, 
        forceRefresh: true 
      }));
    } catch (err) {
      setError({ code: 'FETCH_ERROR', message: 'Failed to fetch thread' });
    }
  }, [dispatch]);

  const refreshThreads = useCallback(() => {
    dispatch(fetchMessageThreads({ 
      page: 1, 
      limit: 50, 
      forceRefresh: true 
    }));
  }, [dispatch]);

  // Message search functionality
  const searchMessages = useCallback(async (query: string, threadId?: string) => {
    try {
      const response = await fetch(
        `/api/messages/search?q=${query}${threadId ? `&threadId=${threadId}` : ''}`
      );
      if (!response.ok) throw new Error('Search failed');
      return await response.json();
    } catch (err) {
      setError({ code: 'SEARCH_ERROR', message: 'Failed to search messages' });
      return [];
    }
  }, []);

  return {
    // State
    threads,
    currentThread,
    loading: loadingState === 'loading',
    error,
    isOffline,
    typingUsers,
    draftMessages,

    // Message Actions
    sendMessage: sendMessageWithRetry,
    markThreadAsRead: (threadId: string) => dispatch(markThreadAsRead(threadId)),
    setTypingStatus,
    saveDraft,
    
    // Thread Actions
    fetchThread,
    refreshThreads,
    searchMessages,
    
    // Utility Actions
    clearError: () => {
      setError(null);
      dispatch(clearMessageError());
    }
  };
}