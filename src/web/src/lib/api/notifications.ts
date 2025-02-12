// @package axios@1.4.0
import axiosInstance from '../axios';
import {
  Notification,
  NotificationPreference,
  NotificationFilter,
  NotificationType,
  NotificationStatus
} from '../../types/notification';

// API endpoint configuration
const API_ENDPOINT = '/notifications';

// Cache configuration for optimizing API requests
const CACHE_CONFIG = {
  ttl: 300000, // 5 minutes
  maxSize: 100
};

// Local cache implementation
const cache = new Map<string, { data: any; timestamp: number }>();

/**
 * Retrieves paginated notifications with advanced filtering
 * @param filter - Notification filter criteria
 * @returns Promise with notifications array and pagination metadata
 */
export const getNotifications = async (
  filter: NotificationFilter
): Promise<{ notifications: Notification[]; total: number; page: number }> => {
  try {
    // Generate cache key based on filter parameters
    const cacheKey = `notifications:${JSON.stringify(filter)}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await axiosInstance.get(API_ENDPOINT, {
      params: {
        types: filter.types,
        statuses: filter.statuses,
        priorities: filter.priorities,
        startDate: filter.dateRange.start.toISOString(),
        endDate: filter.dateRange.end.toISOString(),
        read: filter.read,
        search: filter.search,
        page: filter.pagination.page,
        limit: filter.pagination.limit,
        sortField: filter.sort.field,
        sortOrder: filter.sort.order
      }
    });

    const result = {
      notifications: response.data.notifications,
      total: response.data.total,
      page: filter.pagination.page
    };

    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
};

/**
 * Retrieves a single notification by ID
 * @param id - Notification ID
 * @returns Promise with notification object
 */
export const getNotificationById = async (id: string): Promise<Notification> => {
  try {
    const cacheKey = `notification:${id}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await axiosInstance.get(`${API_ENDPOINT}/${id}`);
    setCachedData(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching notification:', error);
    throw error;
  }
};

/**
 * Marks a notification as read with optimistic updates
 * @param id - Notification ID
 */
export const markAsRead = async (id: string): Promise<void> => {
  try {
    // Optimistic update
    updateCachedNotification(id, { status: NotificationStatus.READ, readAt: new Date() });

    await axiosInstance.put(`${API_ENDPOINT}/${id}/read`);
    
    // Emit event for real-time updates
    emitNotificationUpdate(id, 'read');
  } catch (error) {
    // Revert optimistic update on failure
    revertCachedNotification(id);
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Marks all notifications as read for specified types
 * @param types - Optional array of notification types to mark as read
 */
export const markAllAsRead = async (types?: NotificationType[]): Promise<void> => {
  try {
    // Optimistic update for all matching notifications
    updateAllCachedNotifications(types);

    await axiosInstance.put(`${API_ENDPOINT}/read-all`, { types });
    
    // Emit bulk update event
    emitNotificationUpdate('all', 'read');
  } catch (error) {
    // Revert optimistic updates on failure
    revertAllCachedNotifications();
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

/**
 * Updates notification preferences
 * @param preferences - Updated notification preferences
 * @returns Promise with updated preferences
 */
export const updatePreferences = async (
  preferences: NotificationPreference
): Promise<NotificationPreference> => {
  try {
    validatePreferences(preferences);
    
    const response = await axiosInstance.put(
      `${API_ENDPOINT}/preferences`,
      preferences
    );

    // Update preferences cache
    setCachedData('notification:preferences', response.data);
    
    // Emit preference update event
    emitPreferenceUpdate(response.data);
    
    return response.data;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    throw error;
  }
};

/**
 * Retrieves current notification preferences
 * @returns Promise with current preferences
 */
export const getPreferences = async (): Promise<NotificationPreference> => {
  try {
    const cached = getCachedData('notification:preferences');
    if (cached) {
      return cached;
    }

    const response = await axiosInstance.get(`${API_ENDPOINT}/preferences`);
    setCachedData('notification:preferences', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    throw error;
  }
};

// Cache utility functions
const getCachedData = (key: string): any | null => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.ttl) {
    return cached.data;
  }
  return null;
};

const setCachedData = (key: string, data: any): void => {
  if (cache.size >= CACHE_CONFIG.maxSize) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
};

const updateCachedNotification = (id: string, updates: Partial<Notification>): void => {
  const cacheKey = `notification:${id}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    setCachedData(cacheKey, { ...cached, ...updates });
  }
};

const revertCachedNotification = (id: string): void => {
  const cacheKey = `notification:${id}`;
  cache.delete(cacheKey);
};

const updateAllCachedNotifications = (types?: NotificationType[]): void => {
  cache.forEach((value, key) => {
    if (key.startsWith('notifications:')) {
      const notifications = value.data.notifications.map((notification: Notification) => {
        if (!types || types.includes(notification.type)) {
          return {
            ...notification,
            status: NotificationStatus.READ,
            readAt: new Date()
          };
        }
        return notification;
      });
      setCachedData(key, { ...value.data, notifications });
    }
  });
};

const revertAllCachedNotifications = (): void => {
  cache.forEach((_, key) => {
    if (key.startsWith('notifications:')) {
      cache.delete(key);
    }
  });
};

// Validation utility
const validatePreferences = (preferences: NotificationPreference): void => {
  if (!preferences.userId) {
    throw new Error('User ID is required for notification preferences');
  }
  
  if (!preferences.channels || Object.keys(preferences.channels).length === 0) {
    throw new Error('At least one notification channel must be configured');
  }
  
  if (preferences.scheduleEnabled) {
    const { start, end } = preferences.quietHours;
    if (!start || !end || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(start) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(end)) {
      throw new Error('Invalid quiet hours format. Use HH:mm format (24-hour)');
    }
  }
};

// Event emission utilities
const emitNotificationUpdate = (id: string, action: string): void => {
  window.dispatchEvent(new CustomEvent('notification:update', {
    detail: { id, action }
  }));
};

const emitPreferenceUpdate = (preferences: NotificationPreference): void => {
  window.dispatchEvent(new CustomEvent('notification:preferences:update', {
    detail: { preferences }
  }));
};