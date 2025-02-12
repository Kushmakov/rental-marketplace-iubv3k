/**
 * @fileoverview Enterprise-grade configuration module for the listing service
 * Manages property listings, search functionality, and related features with enhanced scalability
 * @version 1.0.0
 */

import { Client } from '@elastic/elasticsearch'; // v8.9.0
import Redis from 'ioredis'; // v5.3.2
import { HTTP_STATUS } from '../../../common/src/constants';
import { DATABASE_CONFIG } from '../../../database/src/config';

/**
 * Core service configuration with enhanced security and monitoring
 */
export const SERVICE_CONFIG = {
  name: 'listing-service',
  port: parseInt(process.env.LISTING_SERVICE_PORT, 10) || 3002,
  host: process.env.LISTING_SERVICE_HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  ssl: process.env.NODE_ENV === 'production',
  timeout: 30000,
  maxRetries: 3,
} as const;

/**
 * Production-grade Elasticsearch configuration with clustering and security
 */
export const ELASTICSEARCH_CONFIG = {
  node: process.env.ELASTICSEARCH_NODE,
  auth: {
    username: process.env.ELASTICSEARCH_USER,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.ELASTICSEARCH_CA_CERT,
  },
  indices: {
    properties: 'rental_properties',
    units: 'rental_units',
    analytics: 'search_analytics',
  },
  settings: {
    number_of_shards: 3,
    number_of_replicas: 2,
    refresh_interval: '1s',
  },
  cluster: {
    healthCheck: true,
    sniffOnStart: true,
    sniffInterval: 30000,
  },
  retry: {
    initialDelay: 100,
    maxDelay: 2000,
    maxRetries: 5,
  },
} as const;

/**
 * Enhanced Redis configuration with clustering and connection pooling
 */
export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  keyPrefix: 'listing:',
  cluster: {
    enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
    nodes: process.env.REDIS_CLUSTER_NODES?.split(','),
    retryDelayMs: 2000,
    maxRedirections: 16,
  },
  sentinel: {
    enabled: process.env.REDIS_SENTINEL_ENABLED === 'true',
    masterName: process.env.REDIS_SENTINEL_MASTER,
    nodes: process.env.REDIS_SENTINEL_NODES?.split(','),
  },
  pool: {
    minConnections: 5,
    maxConnections: 100,
    idleTimeout: 60000,
  },
} as const;

/**
 * Search configuration with performance optimization settings
 */
export const SEARCH_CONFIG = {
  maxResults: 100,
  defaultPageSize: 20,
  maxPageSize: 50,
  cacheExpiry: 1800,
  geoSearchRadius: '50km',
  timeout: 5000,
  retryAttempts: 3,
  analytics: {
    enabled: true,
    sampleRate: 0.1,
  },
} as const;

/**
 * Creates and configures an enterprise-grade Elasticsearch client with monitoring
 * @returns Configured Elasticsearch client instance
 */
export const createElasticsearchClient = (): Client => {
  try {
    // Validate required environment variables
    if (!ELASTICSEARCH_CONFIG.node) {
      throw new Error('Missing required ELASTICSEARCH_NODE environment variable');
    }

    // Create client with enhanced configuration
    const client = new Client({
      node: ELASTICSEARCH_CONFIG.node,
      auth: ELASTICSEARCH_CONFIG.auth,
      ssl: ELASTICSEARCH_CONFIG.ssl,
      requestTimeout: SERVICE_CONFIG.timeout,
      sniffOnStart: ELASTICSEARCH_CONFIG.cluster.sniffOnStart,
      sniffInterval: ELASTICSEARCH_CONFIG.cluster.sniffInterval,
      maxRetries: ELASTICSEARCH_CONFIG.retry.maxRetries,
      name: SERVICE_CONFIG.name,
    });

    // Verify connection and cluster health
    client.cluster.health()
      .then(({ body }) => {
        console.log(`Elasticsearch cluster status: ${body.status}`);
      })
      .catch((error) => {
        console.error('Elasticsearch cluster health check failed:', error);
        throw error;
      });

    return client;
  } catch (error) {
    console.error('Failed to create Elasticsearch client:', error);
    throw new Error(`Elasticsearch initialization failed: ${error.message}`);
  }
};

/**
 * Creates and configures a production-ready Redis client with clustering support
 * @returns Configured Redis client instance
 */
export const createRedisClient = (): Redis => {
  try {
    const options: Redis.RedisOptions = {
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      password: REDIS_CONFIG.password,
      db: REDIS_CONFIG.db,
      keyPrefix: REDIS_CONFIG.keyPrefix,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * REDIS_CONFIG.cluster.retryDelayMs, 2000);
        return delay;
      },
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: SERVICE_CONFIG.timeout,
    };

    let client: Redis;

    if (REDIS_CONFIG.cluster.enabled && REDIS_CONFIG.cluster.nodes) {
      client = new Redis.Cluster(REDIS_CONFIG.cluster.nodes, {
        redisOptions: options,
        maxRedirections: REDIS_CONFIG.cluster.maxRedirections,
        scaleReads: 'slave',
      });
    } else if (REDIS_CONFIG.sentinel.enabled && REDIS_CONFIG.sentinel.nodes) {
      client = new Redis({
        ...options,
        sentinels: REDIS_CONFIG.sentinel.nodes.map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) };
        }),
        name: REDIS_CONFIG.sentinel.masterName,
      });
    } else {
      client = new Redis(options);
    }

    // Error handling
    client.on('error', (error) => {
      console.error('Redis client error:', error);
    });

    // Connection monitoring
    client.on('connect', () => {
      console.log('Redis client connected successfully');
    });

    return client;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    throw new Error(`Redis initialization failed: ${error.message}`);
  }
};