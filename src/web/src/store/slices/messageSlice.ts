// @reduxjs/toolkit@1.9.0
import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { Message, MessageThread, MessageType, MessageStatus, MessageFilters } from '../../types/message';

// State interface with comprehensive message management
interface MessageState {
  threads: Record<string, MessageThread>;
  messages: Record<string, Record<string, Message>>;
  optimisticMessages: Record<string, Message>;
  loadingStates: {
    threads: 'idle' | 'loading' | 'failed';
    messages: Record<string, 'idle' | 'loading' | 'failed'>;
  };
  cache: {
    threadsLastFetched: number;
    messagesByThread: Record<string, number>;
  };
  error: string | null;
}

const initialState: MessageState = {
  threads: {},
  messages: {},
  optimisticMessages: {},
  loadingStates: {
    threads: 'idle',
    messages: {},
  },
  cache: {
    threadsLastFetched: 0,
    messagesByThread: {},
  },
  error: null,
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Enhanced async thunk for fetching message threads with caching
export const fetchMessageThreads = createAsyncThunk(
  'messages/fetchThreads',
  async ({ page, limit, forceRefresh = false }: { page: number; limit: number; forceRefresh?: boolean }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { messages: MessageState };
      const now = Date.now();

      // Return cached data if valid and refresh not forced
      if (!forceRefresh && 
          now - state.messages.cache.threadsLastFetched < CACHE_DURATION) {
        return Object.values(state.messages.threads);
      }

      const response = await fetch(`/api/messages/threads?page=${page}&limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch threads');
      
      const threads: MessageThread[] = await response.json();
      return threads;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Enhanced async thunk for sending messages with optimistic updates
export const sendMessage = createAsyncThunk(
  'messages/sendMessage',
  async (messageData: {
    content: string;
    threadId: string;
    type?: MessageType;
    attachments?: File[];
    metadata?: Record<string, unknown>;
  }, { getState, dispatch, rejectWithValue }) => {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message
    const optimisticMessage: Message = {
      id: optimisticId,
      threadId: messageData.threadId,
      content: messageData.content,
      type: messageData.type || MessageType.TEXT,
      status: MessageStatus.SENT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: [],
      metadata: messageData.metadata || {},
    };

    try {
      // Handle file uploads if present
      let attachmentUrls = [];
      if (messageData.attachments?.length) {
        const uploadPromises = messageData.attachments.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          const response = await fetch('/api/messages/attachments', {
            method: 'POST',
            body: formData,
          });
          return response.json();
        });
        attachmentUrls = await Promise.all(uploadPromises);
      }

      // Send message to API
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...messageData,
          attachments: attachmentUrls,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const sentMessage = await response.json();
      return { optimisticId, message: sentMessage };
    } catch (error) {
      return rejectWithValue({ optimisticId, error: error.message });
    }
  }
);

// Message slice with comprehensive state management
const messageSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    updateMessageStatus(state, action: PayloadAction<{ messageId: string; status: MessageStatus }>) {
      const { messageId, status } = action.payload;
      const threadId = Object.keys(state.messages).find(threadId => 
        state.messages[threadId][messageId]
      );
      
      if (threadId && state.messages[threadId][messageId]) {
        state.messages[threadId][messageId].status = status;
      }
    },
    
    clearMessageError(state) {
      state.error = null;
    },
    
    markThreadAsRead(state, action: PayloadAction<string>) {
      const threadId = action.payload;
      if (state.threads[threadId]) {
        state.threads[threadId].unreadCount = 0;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchMessageThreads
      .addCase(fetchMessageThreads.pending, (state) => {
        state.loadingStates.threads = 'loading';
      })
      .addCase(fetchMessageThreads.fulfilled, (state, action) => {
        state.loadingStates.threads = 'idle';
        state.threads = action.payload.reduce((acc, thread) => {
          acc[thread.id] = thread;
          return acc;
        }, {} as Record<string, MessageThread>);
        state.cache.threadsLastFetched = Date.now();
      })
      .addCase(fetchMessageThreads.rejected, (state, action) => {
        state.loadingStates.threads = 'failed';
        state.error = action.payload as string;
      })
      
      // Handle sendMessage
      .addCase(sendMessage.pending, (state, action) => {
        const { threadId, content, type = MessageType.TEXT } = action.meta.arg;
        const optimisticId = `opt_${Date.now()}`;
        
        state.optimisticMessages[optimisticId] = {
          id: optimisticId,
          threadId,
          content,
          type,
          status: MessageStatus.SENT,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attachments: [],
          metadata: {},
        };
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { optimisticId, message } = action.payload;
        const threadId = message.threadId;
        
        // Remove optimistic message and add real message
        delete state.optimisticMessages[optimisticId];
        if (!state.messages[threadId]) {
          state.messages[threadId] = {};
        }
        state.messages[threadId][message.id] = message;
        
        // Update thread last message
        if (state.threads[threadId]) {
          state.threads[threadId].lastMessage = message;
          state.threads[threadId].updatedAt = message.createdAt;
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        const { optimisticId, error } = action.payload as { optimisticId: string; error: string };
        if (state.optimisticMessages[optimisticId]) {
          state.optimisticMessages[optimisticId].status = MessageStatus.FAILED;
        }
        state.error = error;
      });
  },
});

// Memoized selectors for optimized performance
export const selectThreads = createSelector(
  [(state: { messages: MessageState }) => state.messages.threads],
  (threads) => Object.values(threads).sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
);

export const selectThreadMessages = createSelector(
  [
    (state: { messages: MessageState }) => state.messages.messages,
    (state: { messages: MessageState }) => state.messages.optimisticMessages,
    (_: any, threadId: string) => threadId,
  ],
  (messages, optimisticMessages, threadId) => {
    const threadMessages = messages[threadId] || {};
    const threadOptimisticMessages = Object.values(optimisticMessages)
      .filter(msg => msg.threadId === threadId);
    
    return [...Object.values(threadMessages), ...threadOptimisticMessages]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
);

export const selectThreadLoadingState = createSelector(
  [(state: { messages: MessageState }) => state.messages.loadingStates.threads],
  (loadingState) => loadingState
);

export const { updateMessageStatus, clearMessageError, markThreadAsRead } = messageSlice.actions;
export default messageSlice.reducer;