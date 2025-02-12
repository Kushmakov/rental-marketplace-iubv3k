// @package @reduxjs/toolkit@1.9.0
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { 
  Notification, 
  NotificationPreference,
  NotificationFilter,
  NotificationStatus,
  NotificationType 
} from '../../types/notification';
import { getNotifications } from '../../lib/api/notifications';

// State interface definition
interface NotificationState {
  items: Notification[];
  preferences: NotificationPreference | null;
  unreadCount: number;
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
  filter: NotificationFilter;
  offlineQueue: Array<{
    id: string;
    action: string;
    data: any;
  }>;
  cache: {
    [key: string]: {
      data: any;
      timestamp: number;
    };
  };
}

// Initial filter state
const initialFilter: NotificationFilter = {
  types: [],
  statuses: [],
  priorities: [],
  dateRange: {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    end: new Date()
  },
  read: false,
  search: '',
  pagination: {
    page: 1,
    limit: 20
  },
  sort: {
    field: 'createdAt',
    order: 'desc'
  }
};

// Initial state
const initialState: NotificationState = {
  items: [],
  preferences: null,
  unreadCount: 0,
  lastUpdated: null,
  loading: false,
  error: null,
  filter: initialFilter,
  offlineQueue: [],
  cache: {}
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Async thunk for fetching notifications with retry logic
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (filter: NotificationFilter, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { notifications: NotificationState };
      const cacheKey = JSON.stringify(filter);
      const cached = state.notifications.cache[cacheKey];

      // Return cached data if valid
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }

      const response = await getNotifications(filter);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Notification slice
const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setFilter: (state, action) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    markAsRead: (state, action) => {
      const notification = state.items.find(item => item.id === action.payload);
      if (notification) {
        notification.status = NotificationStatus.READ;
        notification.readAt = new Date();
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllAsRead: (state, action) => {
      const types = action.payload?.types as NotificationType[];
      state.items = state.items.map(item => {
        if (!types || types.includes(item.type)) {
          return {
            ...item,
            status: NotificationStatus.READ,
            readAt: new Date()
          };
        }
        return item;
      });
      state.unreadCount = state.items.filter(item => item.status !== NotificationStatus.READ).length;
    },
    updatePreferences: (state, action) => {
      state.preferences = action.payload;
    },
    handleRealTimeUpdate: (state, action) => {
      const { notification, action: updateType } = action.payload;
      
      switch (updateType) {
        case 'new':
          state.items.unshift(notification);
          if (notification.status !== NotificationStatus.READ) {
            state.unreadCount++;
          }
          break;
        case 'update':
          const index = state.items.findIndex(item => item.id === notification.id);
          if (index !== -1) {
            state.items[index] = notification;
          }
          break;
        case 'delete':
          state.items = state.items.filter(item => item.id !== notification.id);
          break;
      }
    },
    addToOfflineQueue: (state, action) => {
      state.offlineQueue.push(action.payload);
    },
    clearOfflineQueue: (state) => {
      state.offlineQueue = [];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.notifications;
        state.unreadCount = action.payload.notifications.filter(
          item => item.status !== NotificationStatus.READ
        ).length;
        state.lastUpdated = Date.now();
        
        // Cache the response
        const cacheKey = JSON.stringify(state.filter);
        state.cache[cacheKey] = {
          data: action.payload,
          timestamp: Date.now()
        };
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

// Selectors
export const selectAllNotifications = (state: { notifications: NotificationState }) => 
  state.notifications.items;

export const selectNotificationsWithFilters = createSelector(
  [selectAllNotifications, (state: { notifications: NotificationState }) => state.notifications.filter],
  (notifications, filter) => {
    return notifications.filter(notification => {
      const matchesType = filter.types.length === 0 || 
        filter.types.includes(notification.type);
      const matchesStatus = filter.statuses.length === 0 || 
        filter.statuses.includes(notification.status);
      const matchesRead = !filter.read || 
        notification.status !== NotificationStatus.READ;
      const matchesSearch = !filter.search || 
        notification.content.title.toLowerCase().includes(filter.search.toLowerCase()) ||
        notification.content.body.toLowerCase().includes(filter.search.toLowerCase());
      
      return matchesType && matchesStatus && matchesRead && matchesSearch;
    });
  }
);

export const selectNotificationMetadata = (state: { notifications: NotificationState }) => ({
  unreadCount: state.notifications.unreadCount,
  lastUpdated: state.notifications.lastUpdated,
  loading: state.notifications.loading,
  error: state.notifications.error
});

export const selectNotificationPreferences = (state: { notifications: NotificationState }) => 
  state.notifications.preferences;

// Export actions and reducer
export const { 
  setFilter, 
  markAsRead, 
  markAllAsRead, 
  updatePreferences, 
  handleRealTimeUpdate,
  addToOfflineQueue,
  clearOfflineQueue
} = notificationSlice.actions;

export default notificationSlice.reducer;