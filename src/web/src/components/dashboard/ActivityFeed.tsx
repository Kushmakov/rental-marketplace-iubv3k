import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, List, ListItem, Skeleton } from '@mui/material'; // @mui/material@5.14.0
import { VariableSizeList as VirtualList } from 'react-window'; // react-window@1.8.9
import { useIntersectionObserver } from 'react-intersection-observer'; // react-intersection-observer@9.5.2

import { Notification, NotificationType } from '../../types/notification';
import { useNotifications } from '../../hooks/useNotifications';
import LoadingButton from '../common/LoadingButton';

interface ActivityFeedProps {
  limit?: number;
  showLoadMore?: boolean;
  className?: string;
  virtualizedRowHeight?: number;
  cacheSize?: number;
  enablePullToRefresh?: boolean;
  onNotificationClick?: (notification: Notification) => void;
  retryConfig?: {
    maxAttempts: number;
    delay: number;
  };
}

const DEFAULT_ROW_HEIGHT = 72;
const DEFAULT_CACHE_SIZE = 50;
const DEFAULT_LIMIT = 20;

const formatActivityTime = (date: Date, locale: string = 'en-US'): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).format(date);
  }
};

const getActivityIcon = (type: NotificationType): JSX.Element => {
  // Implementation would include Material Icons based on notification type
  // This is a placeholder that would be replaced with actual icons
  return <span role="img" aria-label={type.toLowerCase()}>{type}</span>;
};

const handleRetry = async (
  error: Error,
  retryCount: number,
  config: ActivityFeedProps['retryConfig']
): Promise<void> => {
  const maxAttempts = config?.maxAttempts || 3;
  const delay = config?.delay || 1000;

  if (retryCount >= maxAttempts) {
    throw new Error('Max retry attempts reached');
  }

  await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, retryCount)));
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  limit = DEFAULT_LIMIT,
  showLoadMore = true,
  className,
  virtualizedRowHeight = DEFAULT_ROW_HEIGHT,
  cacheSize = DEFAULT_CACHE_SIZE,
  enablePullToRefresh = true,
  onNotificationClick,
  retryConfig
}) => {
  const {
    notifications,
    isLoading,
    loadNotifications,
    markAsRead
  } = useNotifications();

  const listRef = useRef<VirtualList>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);

  const { ref: intersectionRef, inView } = useIntersectionObserver({
    threshold: 0.5,
    triggerOnce: true
  });

  const getItemSize = useCallback((index: number) => {
    const notification = notifications[index];
    const contentLength = notification?.content.body.length || 0;
    return contentLength > 100 ? virtualizedRowHeight * 1.5 : virtualizedRowHeight;
  }, [notifications, virtualizedRowHeight]);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    try {
      await markAsRead(notification.id);
      onNotificationClick?.(notification);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, [markAsRead, onNotificationClick]);

  const loadMore = useCallback(async () => {
    try {
      await loadNotifications({
        pagination: {
          page: Math.ceil(notifications.length / limit),
          limit
        }
      });
      retryCountRef.current = 0;
    } catch (error) {
      await handleRetry(error, retryCountRef.current, retryConfig);
      retryCountRef.current++;
      loadMore();
    }
  }, [loadNotifications, notifications.length, limit, retryConfig]);

  useEffect(() => {
    if (inView && showLoadMore && !isLoading) {
      loadMore();
    }
  }, [inView, showLoadMore, isLoading, loadMore]);

  useEffect(() => {
    if (enablePullToRefresh) {
      let touchStart = 0;
      const handleTouchStart = (e: TouchEvent) => {
        touchStart = e.touches[0].clientY;
      };
      const handleTouchMove = async (e: TouchEvent) => {
        const touchEnd = e.touches[0].clientY;
        if (touchEnd - touchStart > 100 && containerRef.current?.scrollTop === 0) {
          await loadNotifications();
        }
      };

      const container = containerRef.current;
      container?.addEventListener('touchstart', handleTouchStart);
      container?.addEventListener('touchmove', handleTouchMove);

      return () => {
        container?.removeEventListener('touchstart', handleTouchStart);
        container?.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [enablePullToRefresh, loadNotifications]);

  const renderNotification = useCallback(({ index, style }) => {
    const notification = notifications[index];
    if (!notification) return null;

    return (
      <ListItem
        style={style}
        onClick={() => handleNotificationClick(notification)}
        button
        divider
        aria-label={`Notification: ${notification.content.title}`}
      >
        <Box display="flex" alignItems="center" width="100%">
          {getActivityIcon(notification.type)}
          <Box ml={2} flex={1}>
            <Typography variant="subtitle2" component="div">
              {notification.content.title}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {notification.content.body}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {formatActivityTime(new Date(notification.createdAt))}
            </Typography>
          </Box>
        </Box>
      </ListItem>
    );
  }, [notifications, handleNotificationClick]);

  const loadingItems = useMemo(() => (
    Array.from({ length: 3 }).map((_, index) => (
      <ListItem key={index}>
        <Box width="100%" display="flex" alignItems="center">
          <Skeleton variant="circular" width={40} height={40} />
          <Box ml={2} flex={1}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="60%" />
          </Box>
        </Box>
      </ListItem>
    ))
  ), []);

  return (
    <Box
      ref={containerRef}
      className={className}
      sx={{
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {isLoading && notifications.length === 0 ? (
        <List>{loadingItems}</List>
      ) : (
        <>
          <VirtualList
            ref={listRef}
            height={600}
            width="100%"
            itemCount={notifications.length}
            itemSize={getItemSize}
            overscanCount={5}
            itemData={notifications}
          >
            {renderNotification}
          </VirtualList>
          {showLoadMore && (
            <Box ref={intersectionRef} textAlign="center" py={2}>
              <LoadingButton
                loading={isLoading}
                onClick={loadMore}
                variant="text"
                size="small"
              >
                Load More
              </LoadingButton>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default ActivityFeed;