import { useEffect, useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import debounce from 'lodash/debounce'; // ^4.17.21
import { 
  Notification, 
  NotificationFilter, 
  NotificationPreference,
  NotificationStatus,
  NotificationType 
} from '../types/notification';

// Constants for configuration
const CACHE_KEY = 'notifications_cache_v1';
const DEBOUNCE_DELAY = 300;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

interface UseNotificationsOptions {
  filter?: NotificationFilter;
  enableRealtime?: boolean;
}

interface NotificationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface NotificationState {
  notifications: Notification[];
  preferences: NotificationPreference[];
  isLoading: boolean;
  error: NotificationError | null;
  isOnline: boolean;
  hasUnread: boolean;
}

export function useNotifications({ 
  filter, 
  enableRealtime = false 
}: UseNotificationsOptions = {}) {
  const dispatch = useDispatch();
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  
  // Redux selectors
  const notifications = useSelector((state: any) => state.notifications.items);
  const preferences = useSelector((state: any) => state.notifications.preferences);
  const isLoading = useSelector((state: any) => state.notifications.loading);
  const error = useSelector((state: any) => state.notifications.error);
  
  // Local state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [hasUnread, setHasUnread] = useState<boolean>(false);

  // Cache management
  const saveToCache = useCallback((data: Notification[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Cache save failed:', error);
    }
  }, []);

  const loadFromCache = useCallback((): Notification[] => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.error('Cache load failed:', error);
      return [];
    }
  }, []);

  // WebSocket connection management
  const initializeWebSocket = useCallback(() => {
    if (!enableRealtime || wsRef.current) return;

    const ws = new WebSocket(process.env.REACT_APP_WS_URL as string);
    
    ws.onopen = () => {
      retryCountRef.current = 0;
      dispatch({ type: 'NOTIFICATIONS_WS_CONNECTED' });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      dispatch({ type: 'NOTIFICATIONS_RECEIVED', payload: data });
    };

    ws.onclose = () => {
      if (retryCountRef.current < RETRY_ATTEMPTS) {
        setTimeout(() => {
          retryCountRef.current++;
          initializeWebSocket();
        }, RETRY_DELAY * retryCountRef.current);
      }
    };

    wsRef.current = ws;
  }, [dispatch, enableRealtime]);

  // API calls with optimistic updates
  const loadNotifications = useCallback(async (filter?: NotificationFilter) => {
    try {
      dispatch({ type: 'NOTIFICATIONS_LOADING' });
      
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter)
      });
      
      if (!response.ok) throw new Error('Failed to load notifications');
      
      const data = await response.json();
      dispatch({ type: 'NOTIFICATIONS_LOADED', payload: data });
      saveToCache(data);
      
      return data;
    } catch (error) {
      dispatch({ 
        type: 'NOTIFICATIONS_ERROR', 
        payload: { code: 'LOAD_ERROR', message: error.message } 
      });
      return loadFromCache();
    }
  }, [dispatch, saveToCache, loadFromCache]);

  const loadPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/preferences');
      if (!response.ok) throw new Error('Failed to load preferences');
      
      const data = await response.json();
      dispatch({ type: 'PREFERENCES_LOADED', payload: data });
      return data;
    } catch (error) {
      dispatch({ 
        type: 'NOTIFICATIONS_ERROR', 
        payload: { code: 'PREF_LOAD_ERROR', message: error.message } 
      });
    }
  }, [dispatch]);

  const updatePreferences = useCallback(async (
    preferences: Partial<NotificationPreference>
  ) => {
    try {
      dispatch({ type: 'PREFERENCES_UPDATING' });
      
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });
      
      if (!response.ok) throw new Error('Failed to update preferences');
      
      const data = await response.json();
      dispatch({ type: 'PREFERENCES_UPDATED', payload: data });
      return data;
    } catch (error) {
      dispatch({ 
        type: 'NOTIFICATIONS_ERROR', 
        payload: { code: 'PREF_UPDATE_ERROR', message: error.message } 
      });
    }
  }, [dispatch]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      // Optimistic update
      dispatch({ 
        type: 'NOTIFICATION_STATUS_UPDATED', 
        payload: { id: notificationId, status: NotificationStatus.READ } 
      });
      
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to mark notification as read');
      
      return await response.json();
    } catch (error) {
      // Revert optimistic update
      dispatch({ 
        type: 'NOTIFICATION_STATUS_REVERTED', 
        payload: { id: notificationId } 
      });
      throw error;
    }
  }, [dispatch]);

  const clearAll = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/clear', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear notifications');
      
      dispatch({ type: 'NOTIFICATIONS_CLEARED' });
      saveToCache([]);
    } catch (error) {
      dispatch({ 
        type: 'NOTIFICATIONS_ERROR', 
        payload: { code: 'CLEAR_ERROR', message: error.message } 
      });
    }
  }, [dispatch, saveToCache]);

  // Debounced filter updates
  const debouncedLoadNotifications = useCallback(
    debounce((filter: NotificationFilter) => loadNotifications(filter), DEBOUNCE_DELAY),
    [loadNotifications]
  );

  // Effect for online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Effect for WebSocket connection
  useEffect(() => {
    if (enableRealtime) {
      initializeWebSocket();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enableRealtime, initializeWebSocket]);

  // Effect for filter updates
  useEffect(() => {
    if (filter) {
      debouncedLoadNotifications(filter);
    }
  }, [filter, debouncedLoadNotifications]);

  // Effect for unread status
  useEffect(() => {
    setHasUnread(notifications.some(
      (n: Notification) => n.status !== NotificationStatus.READ
    ));
  }, [notifications]);

  return {
    // State
    notifications,
    preferences,
    isLoading,
    error,
    isOnline,
    hasUnread,
    
    // Actions
    loadNotifications,
    loadPreferences,
    updatePreferences,
    markAsRead,
    clearAll,
    
    // Real-time control
    enableRealtime: initializeWebSocket,
    disableRealtime: () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  };
}