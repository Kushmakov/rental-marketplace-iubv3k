'use client';

import { useState, useEffect, useCallback } from 'react';
import { Grid, Box, CircularProgress, Alert, Skeleton } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

// Internal imports
import { MessageList } from '../../../components/messages/MessageList';
import { MessageThread } from '../../../components/messages/MessageThread';
import { useMessages } from '../../../hooks/useMessages';
import { useAuth } from '../../../hooks/useAuth';

// Constants for virtualization and performance
const VIRTUALIZATION_CONFIG = {
  itemSize: 72,
  windowSize: 600,
  overscanCount: 5
};

/**
 * Enhanced Messages Page component with real-time updates and optimized performance
 * Implements virtualization for large message lists and supports cross-device synchronization
 */
const MessagesPage = () => {
  // State management
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Authentication and user context
  const { user, isAuthenticated } = useAuth();

  // Message management with real-time updates
  const {
    threads,
    loading,
    error: messageError,
    markThreadAsRead
  } = useMessages({
    limit: 50,
    enableOfflineSupport: true
  }, {
    enableEncryption: true,
    enableTypingIndicators: true,
    enableReadReceipts: true
  });

  // Initialize virtualizer for optimized list performance
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => document.querySelector('#message-list-container'),
    estimateSize: () => VIRTUALIZATION_CONFIG.itemSize,
    overscan: VIRTUALIZATION_CONFIG.overscanCount
  });

  // Handle thread selection with optimistic updates
  const handleThreadSelect = useCallback(async (threadId: string) => {
    setSelectedThreadId(threadId);
    
    // Mark thread as read optimistically
    const thread = threads.find(t => t.id === threadId);
    if (thread?.unreadCount > 0) {
      await markThreadAsRead(threadId);
    }

    // Update URL for deep linking without page reload
    window.history.replaceState(
      {},
      '',
      `/messages/${threadId}`
    );
  }, [threads, markThreadAsRead]);

  // Effect for handling initial thread selection from URL
  useEffect(() => {
    const threadId = window.location.pathname.split('/messages/')[1];
    if (threadId && threads.some(t => t.id === threadId)) {
      handleThreadSelect(threadId);
    }
  }, [threads, handleThreadSelect]);

  // Effect for handling real-time updates and cross-tab synchronization
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh messages when tab becomes visible
        window.location.reload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Authentication check
  if (!isAuthenticated) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Please sign in to access messages
      </Alert>
    );
  }

  // Loading state with optimized skeleton loading
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            {[...Array(5)].map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={VIRTUALIZATION_CONFIG.itemSize - 8}
                sx={{ my: 1, borderRadius: 1 }}
              />
            ))}
          </Grid>
          <Grid item xs={12} md={8}>
            <Skeleton 
              variant="rectangular" 
              height={VIRTUALIZATION_CONFIG.windowSize}
              sx={{ borderRadius: 1 }}
            />
          </Grid>
        </Grid>
      </Box>
    );
  }

  // Error state with retry option
  if (messageError || error) {
    return (
      <Alert 
        severity="error" 
        sx={{ m: 2 }}
        action={
          <Box 
            onClick={() => window.location.reload()} 
            sx={{ cursor: 'pointer' }}
          >
            Retry
          </Box>
        }
      >
        {messageError || error}
      </Alert>
    );
  }

  return (
    <Box sx={{ height: '100%', p: 2 }}>
      <Grid container spacing={2} sx={{ height: '100%' }}>
        {/* Message List with virtualization */}
        <Grid 
          item 
          xs={12} 
          md={4} 
          sx={{ 
            height: { md: '100%' },
            display: { xs: selectedThreadId ? 'none' : 'block', md: 'block' }
          }}
        >
          <Box
            id="message-list-container"
            sx={{
              height: '100%',
              overflow: 'auto',
              bgcolor: 'background.paper',
              borderRadius: 1
            }}
          >
            <MessageList
              currentUserId={user?.id || ''}
              onThreadSelect={handleThreadSelect}
              virtualizedProps={{
                virtualizer,
                itemSize: VIRTUALIZATION_CONFIG.itemSize,
                windowSize: VIRTUALIZATION_CONFIG.windowSize
              }}
            />
          </Box>
        </Grid>

        {/* Selected Thread with real-time updates */}
        <Grid 
          item 
          xs={12} 
          md={8}
          sx={{ 
            height: { md: '100%' },
            display: { xs: selectedThreadId ? 'block' : 'none', md: 'block' }
          }}
        >
          {selectedThreadId ? (
            <Box
              sx={{
                height: '100%',
                bgcolor: 'background.paper',
                borderRadius: 1
              }}
            >
              <MessageThread
                threadId={selectedThreadId}
                receiverId={user?.id || ''}
              />
            </Box>
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.paper',
                borderRadius: 1
              }}
            >
              Select a conversation to start messaging
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default MessagesPage;