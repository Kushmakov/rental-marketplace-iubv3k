import React, { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CircularProgress, Alert, Box, Skeleton } from '@mui/material';
import { Message } from '../../types/message';
import { MessageComposer } from './MessageComposer';
import { useMessages } from '../../hooks/useMessages';

// Constants for virtualization and performance
const CONTAINER_HEIGHT = 600;
const ESTIMATED_ITEM_SIZE = 80;
const OVERSCAN_COUNT = 5;
const SCROLL_THRESHOLD = 100;
const READ_RECEIPT_DELAY = 1000;

interface MessageThreadProps {
  threadId: string;
  receiverId: string;
}

export const MessageThread: React.FC<MessageThreadProps> = ({ threadId, receiverId }) => {
  // Refs for DOM elements and scroll management
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  const lastScrollPositionRef = useRef(0);
  const readTimeoutRef = useRef<NodeJS.Timeout>();

  // Custom hook for message management
  const {
    currentThread,
    loading,
    error,
    fetchThread,
    markThreadAsRead,
  } = useMessages({
    threadId,
    limit: 50,
  }, {
    enableEncryption: true,
    enableOfflineSupport: true,
    enableTypingIndicators: true,
    enableReadReceipts: true,
  });

  // Initialize virtualizer for message list
  const rowVirtualizer = useVirtualizer({
    count: currentThread?.length || 0,
    getScrollElement: () => messageContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_SIZE,
    overscan: OVERSCAN_COUNT,
    getItemKey: (index) => currentThread?.[index]?.id || index,
  });

  // Effect for initial thread loading and cleanup
  useEffect(() => {
    fetchThread(threadId);

    return () => {
      if (readTimeoutRef.current) {
        clearTimeout(readTimeoutRef.current);
      }
    };
  }, [threadId, fetchThread]);

  // Effect for marking messages as read
  useEffect(() => {
    if (currentThread?.length && messageContainerRef.current) {
      readTimeoutRef.current = setTimeout(() => {
        markThreadAsRead(threadId);
      }, READ_RECEIPT_DELAY);
    }
  }, [currentThread, threadId, markThreadAsRead]);

  // Scroll to bottom handler with smooth behavior
  const scrollToBottom = (smooth = true) => {
    if (messageContainerRef.current) {
      const container = messageContainerRef.current;
      const scrollHeight = container.scrollHeight;
      const currentScroll = container.scrollTop;
      const clientHeight = container.clientHeight;

      // Only scroll if near bottom or forced
      if (scrollHeight - currentScroll - clientHeight < SCROLL_THRESHOLD) {
        container.scrollTo({
          top: scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
        lastScrollPositionRef.current = scrollHeight;
      }
    }
  };

  // Message sent handler with optimistic updates
  const handleMessageSent = (message: Message) => {
    scrollToBottom(true);
  };

  // Message renderer with virtualization support
  const renderMessage = (message: Message, virtualRow: any) => {
    const isOwnMessage = message.senderId === receiverId;

    return (
      <Box
        ref={virtualRow.measureRef}
        key={message.id}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }}
        sx={{
          p: 1,
          display: 'flex',
          justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
        }}
      >
        <Box
          sx={{
            maxWidth: '70%',
            p: 2,
            borderRadius: 2,
            bgcolor: isOwnMessage ? 'primary.main' : 'background.paper',
            color: isOwnMessage ? 'primary.contrastText' : 'text.primary',
          }}
        >
          <Box sx={{ wordBreak: 'break-word' }}>{message.content}</Box>
          <Box
            sx={{
              mt: 0.5,
              fontSize: '0.75rem',
              opacity: 0.7,
              textAlign: isOwnMessage ? 'right' : 'left',
            }}
          >
            {new Date(message.createdAt).toLocaleTimeString()}
          </Box>
        </Box>
      </Box>
    );
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {[...Array(5)].map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            width={`${Math.random() * 30 + 50}%`}
            height={60}
            sx={{ my: 1, borderRadius: 1 }}
          />
        ))}
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        ref={messageContainerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          height: CONTAINER_HEIGHT,
        }}
      >
        <Box
          ref={virtualListRef}
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const message = currentThread?.[virtualRow.index];
            return message ? renderMessage(message, virtualRow) : null;
          })}
        </Box>
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <MessageComposer
          threadId={threadId}
          receiverId={receiverId}
          onMessageSent={handleMessageSent}
        />
      </Box>
    </Box>
  );
};