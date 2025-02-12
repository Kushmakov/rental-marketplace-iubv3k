import Analytics from 'segment-analytics-node';
import mixpanel from 'mixpanel-browser';
import { User, UserRole } from '../types/auth';
import { Property, PropertyType } from '../types/property';

// Environment variables and constants
const SEGMENT_WRITE_KEY = process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY;
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 10;
const OFFLINE_QUEUE_SIZE = 100;

// Type definitions for analytics events
interface PageViewProperties {
  path: string;
  referrer?: string;
  title?: string;
  loadTime?: number;
  deviceType?: string;
}

interface EventProperties {
  [key: string]: any;
}

interface UserTraits {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  lastLogin?: Date;
}

interface ViewContext {
  source: string;
  searchQuery?: string;
  filters?: object;
  position?: number;
}

interface ConversionData {
  type: string;
  value: number;
  propertyId?: string;
  applicationId?: string;
  funnelStage?: string;
  testVariant?: string;
}

// Analytics service class
class AnalyticsService {
  private segment: Analytics | null = null;
  private offlineQueue: Array<{ type: string; payload: any }> = [];
  private initialized = false;

  /**
   * Initializes analytics providers with enhanced configuration
   */
  async initializeAnalytics(): Promise<void> {
    try {
      if (!SEGMENT_WRITE_KEY || !MIXPANEL_TOKEN) {
        throw new Error('Analytics configuration missing');
      }

      // Initialize Segment
      this.segment = new Analytics({
        writeKey: SEGMENT_WRITE_KEY,
        maxRetries: RETRY_ATTEMPTS,
        flushAt: BATCH_SIZE,
      });

      // Initialize Mixpanel with offline support
      mixpanel.init(MIXPANEL_TOKEN, {
        persistence: 'localStorage',
        upgrade: true,
        batch_requests: true,
        api_host: 'https://api.mixpanel.com',
      });

      // Configure default properties
      this.setDefaultProperties();
      this.initialized = true;

      // Process any queued events
      await this.processOfflineQueue();
    } catch (error) {
      console.error('Analytics initialization failed:', error);
      this.queueOfflineEvents();
    }
  }

  /**
   * Tracks page views with enhanced metadata
   */
  async trackPageView(pageName: string, properties: PageViewProperties): Promise<void> {
    if (!this.validateInitialization()) return;

    try {
      const enrichedProperties = {
        ...properties,
        timestamp: new Date().toISOString(),
        performance: this.getPagePerformanceMetrics(),
      };

      await Promise.all([
        this.segment?.page(pageName, enrichedProperties),
        mixpanel.track('Page View', { page: pageName, ...enrichedProperties }),
      ]);
    } catch (error) {
      console.error('Page view tracking failed:', error);
      this.queueEvent('pageView', { pageName, properties });
    }
  }

  /**
   * Tracks user actions with comprehensive validation
   */
  async trackUserAction(eventName: string, eventProperties: EventProperties): Promise<void> {
    if (!this.validateInitialization()) return;

    try {
      const validatedProperties = this.validateEventProperties(eventProperties);
      const enrichedProperties = {
        ...validatedProperties,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
      };

      await Promise.all([
        this.segment?.track(eventName, enrichedProperties),
        mixpanel.track(eventName, enrichedProperties),
      ]);
    } catch (error) {
      console.error('User action tracking failed:', error);
      this.queueEvent('userAction', { eventName, eventProperties });
    }
  }

  /**
   * Associates user identity with enhanced traits
   */
  async identifyUser(user: User, traits: UserTraits): Promise<void> {
    if (!this.validateInitialization()) return;

    try {
      const sanitizedTraits = this.sanitizeUserTraits(traits);

      await Promise.all([
        this.segment?.identify(user.id, sanitizedTraits),
        mixpanel.identify(user.id),
        mixpanel.people.set(sanitizedTraits),
      ]);
    } catch (error) {
      console.error('User identification failed:', error);
      this.queueEvent('identify', { user, traits });
    }
  }

  /**
   * Tracks property views with conversion tracking
   */
  async trackPropertyView(property: Property, context: ViewContext): Promise<void> {
    if (!this.validateInitialization()) return;

    try {
      const propertyViewData = {
        propertyId: property.id,
        propertyType: property.type,
        viewDuration: 0,
        ...context,
        timestamp: new Date().toISOString(),
      };

      await Promise.all([
        this.segment?.track('Property Viewed', propertyViewData),
        mixpanel.track('Property Viewed', propertyViewData),
      ]);

      // Start tracking view duration
      this.trackViewDuration(property.id);
    } catch (error) {
      console.error('Property view tracking failed:', error);
      this.queueEvent('propertyView', { property, context });
    }
  }

  /**
   * Tracks conversion events with funnel analysis
   */
  async trackConversion(conversionType: string, conversionData: ConversionData): Promise<void> {
    if (!this.validateInitialization()) return;

    try {
      const enrichedData = {
        ...conversionData,
        timestamp: new Date().toISOString(),
        revenue: conversionData.value,
      };

      await Promise.all([
        this.segment?.track('Conversion', enrichedData),
        mixpanel.track('Conversion', enrichedData),
        mixpanel.people.track_charge(conversionData.value),
      ]);
    } catch (error) {
      console.error('Conversion tracking failed:', error);
      this.queueEvent('conversion', { conversionType, conversionData });
    }
  }

  // Private helper methods
  private validateInitialization(): boolean {
    if (!this.initialized) {
      console.warn('Analytics not initialized');
      return false;
    }
    return true;
  }

  private setDefaultProperties(): void {
    mixpanel.register({
      platform: 'web',
      environment: process.env.NODE_ENV,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    });
  }

  private validateEventProperties(properties: EventProperties): EventProperties {
    // Remove PII and sensitive data
    const sanitized = { ...properties };
    delete sanitized.password;
    delete sanitized.creditCard;
    return sanitized;
  }

  private sanitizeUserTraits(traits: UserTraits): UserTraits {
    return {
      ...traits,
      email: undefined, // Remove email from tracking for privacy
      lastLogin: traits.lastLogin?.toISOString(),
    };
  }

  private getSessionId(): string {
    return window.sessionStorage.getItem('sessionId') || this.generateSessionId();
  }

  private generateSessionId(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    window.sessionStorage.setItem('sessionId', sessionId);
    return sessionId;
  }

  private getPagePerformanceMetrics(): object {
    if (typeof window === 'undefined') return {};

    const navigation = window.performance?.timing;
    if (!navigation) return {};

    return {
      loadTime: navigation.loadEventEnd - navigation.navigationStart,
      domReadyTime: navigation.domContentLoadedEventEnd - navigation.navigationStart,
      networkLatency: navigation.responseEnd - navigation.requestStart,
    };
  }

  private trackViewDuration(propertyId: string): void {
    const startTime = Date.now();
    window.addEventListener('beforeunload', () => {
      const duration = Date.now() - startTime;
      this.trackUserAction('Property View Duration', {
        propertyId,
        durationMs: duration,
      });
    });
  }

  private async processOfflineQueue(): Promise<void> {
    while (this.offlineQueue.length > 0) {
      const event = this.offlineQueue.shift();
      if (!event) continue;

      try {
        switch (event.type) {
          case 'pageView':
            await this.trackPageView(event.payload.pageName, event.payload.properties);
            break;
          case 'userAction':
            await this.trackUserAction(event.payload.eventName, event.payload.eventProperties);
            break;
          case 'identify':
            await this.identifyUser(event.payload.user, event.payload.traits);
            break;
          case 'propertyView':
            await this.trackPropertyView(event.payload.property, event.payload.context);
            break;
          case 'conversion':
            await this.trackConversion(event.payload.conversionType, event.payload.conversionData);
            break;
        }
      } catch (error) {
        console.error('Failed to process queued event:', error);
        // Re-queue failed events
        this.queueEvent(event.type, event.payload);
      }
    }
  }

  private queueEvent(type: string, payload: any): void {
    if (this.offlineQueue.length >= OFFLINE_QUEUE_SIZE) {
      this.offlineQueue.shift(); // Remove oldest event if queue is full
    }
    this.offlineQueue.push({ type, payload });
  }

  private queueOfflineEvents(): void {
    window.addEventListener('online', async () => {
      await this.processOfflineQueue();
    });
  }
}

// Export singleton instance
export const analytics = new AnalyticsService();