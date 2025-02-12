import React, { useEffect, useMemo, useCallback } from 'react';
import { VirtualList } from 'react-window';
import { CircularProgress, Alert, Box, Skeleton } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';

// Internal imports
import { MessageThread as MessageThreadComponent } from './MessageThread';
import { MessageThread } from '../../types/message';
import { useMessages } from '../../hooks/useMessages';

// Constants for virtualization defaults
const DEFAULT_ITEM_SIZE = 72;
const DEFAULT_WINDOW_SIZE = 400;

interface MessageListProps {
  currentUserId: string;
  onThreadSelect: (threadId: string) => void;
  className?: string;
  virtualizationConfig?: {
    itemSize: number;
    windowSize: number;
  };
  enableOfflineSupport?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  currentUserId,
  onThreadSelect,
  className,
  virtualizationConfig = {
    itemSize: DEFAULT_ITEM_SIZE,
    windowSize: DEFAULT_WINDOW_SIZE
  },
  enableOfflineSupport = true
}) => {
  // Custom hook for message management
  const {
    threads,
    loading,
    error,
    refreshThreads,
    markThreadAsRead,
    subscribeToUpdates
  } = useMessages({
    limit: 50,
    enableOfflineSupport
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToUpdates();
    return () => unsubscribe?.();
  }, [subscribeToUpdates]);

  // Refresh threads periodically and on visibility change
  useEffect(() => {
    const interval = setInterval(refreshThreads, 60000); // Refresh every minute
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshThreads();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshThreads]);

  // Sort threads by unread status and last activity
  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      // Unread threads first
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }
      // Then by last activity
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });
  }, [threads]);

  // Generate thread preview text
  const getThreadPreview = useCallback((thread: MessageThread) => {
    const { lastMessage, typingUsers } = thread;
    
    if (typingUsers?.length > 0) {
      const typingNames = typingUsers
        .filter(id => id !== currentUserId)
        .map(id => thread.participantDetails.find(p => p.id === id))
        .filter(Boolean)
        .map(p => p?.firstName)
        .join(', ');
      
      return `${typingNames} ${typingUsers.length === 1 ? 'is' : 'are'} typing...`;
    }

    if (!lastMessage) return '';

    switch (lastMessage.type) {
      case 'IMAGE':
        return '📷 Photo';
      case 'DOCUMENT':
        return '📎 Document';
      case 'SYSTEM':
        return '🔔 System Message';
      default:
        return lastMessage.content.length > 50
          ? `${lastMessage.content.substring(0, 50)}...`
          : lastMessage.content;
    }
  }, [currentUserId]);

  // Handle thread selection with read status update
  const handleThreadClick = useCallback(async (threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (thread?.unreadCount > 0) {
      await markThreadAsRead(threadId);
    }
    onThreadSelect(threadId);
  }, [threads, markThreadAsRead, onThreadSelect]);

  // Render individual thread item
  const renderThread = useCallback(({ index, style }: any) => {
    const thread = sortedThreads[index];
    if (!thread) return null;

    const preview = getThreadPreview(thread);
    const timeAgo = formatDistanceToNow(new Date(thread.lastActivity), { addSuffix: true });
    const participants = thread.participantDetails
      .filter(p => p.id !== currentUserId)
      .map(p => `${p.firstName} ${p.lastName}`)
      .join(', ');

    return (
      <Box
        onClick={() => handleThreadClick(thread.id)}
        sx={{
          p: 2,
          cursor: 'pointer',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: thread.unreadCount > 0 ? 'action.hover' : 'background.paper',
          '&:hover': {
            bgcolor: 'action.selected'
          }
        }}
        style={style}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ fontWeight: thread.unreadCount > 0 ? 'bold' : 'normal' }}>
            {participants}
          </Box>
          <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            {timeAgo}
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ 
            color: thread.typingUsers?.length ? 'primary.main' : 'text.secondary',
            fontSize: '0.875rem',
            fontStyle: thread.typingUsers?.length ? 'italic' : 'normal'
          }}>
            {preview}
          </Box>
          {thread.unreadCount > 0 && (
            <Box sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: '50%',
              minWidth: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem'
            }}>
              {thread.unreadCount}
            </Box>
          )}
        </Box>
      </Box>
    );
  }, [sortedThreads, currentUserId, getThreadPreview, handleThreadClick]);

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {[...Array(5)].map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={virtualizationConfig.itemSize - 8}
            sx={{ my: 1, borderRadius: 1 }}
          />
        ))}
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert 
        severity="error" 
        sx={{ m: 2 }}
        action={
          <Box onClick={refreshThreads} sx={{ cursor: 'pointer' }}>
            Retry
          </Box>
        }
      >
        {error}
      </Alert>
    );
  }

  return (
    <Box className={className}>
      <VirtualList
        height={virtualizationConfig.windowSize}
        itemCount={sortedThreads.length}
        itemSize={virtualizationConfig.itemSize}
        width="100%"
        overscanCount={2}
      >
        {renderThread}
      </VirtualList>
    </Box>
  );
};