/**
 * Express router configuration for property listing endpoints with enhanced
 * security, caching, and monitoring capabilities.
 * @packageDocumentation
 */

import { Router } from 'express'; // v4.18.2
import compression from 'compression'; // v1.7.4
import joi from 'joi'; // v17.9.2

import { ListingController } from '../controllers/listing.controller';
import {
  validateToken,
  validateRole,
  rateLimitMiddleware,
  logger,
  validateRequest,
  cacheMiddleware,
  errorHandler,
  requestTracker
} from '@common/middleware';

// Protected roles that can manage listings
const PROTECTED_ROLES = ['admin', 'propertyManager', 'agent'];

// Rate limiting configuration per endpoint
const RATE_LIMIT_CONFIG = {
  search: { window: '1m', max: 60 },
  create: { window: '1m', max: 30 },
  update: { window: '1m', max: 30 }
};

// Cache TTL configuration in seconds
const CACHE_TTL = {
  search: 300, // 5 minutes
  detail: 600  // 10 minutes
};

// Validation schemas
const searchSchema = joi.object({
  query: joi.string().max(100),
  propertyTypes: joi.array().items(joi.string()),
  priceRange: joi.object({
    min: joi.number().min(0),
    max: joi.number().min(0)
  }),
  bedrooms: joi.number().min(0),
  bathrooms: joi.number().min(0),
  amenities: joi.array().items(joi.string()),
  availableFrom: joi.date().iso(),
  page: joi.number().min(1),
  limit: joi.number().min(1).max(100),
  sortBy: joi.string(),
  sortOrder: joi.string().valid('asc', 'desc'),
  latitude: joi.number(),
  longitude: joi.number(),
  radius: joi.number()
});

const listingSchema = joi.object({
  name: joi.string().required().min(3).max(200),
  description: joi.string().required().min(10),
  type: joi.string().required(),
  status: joi.string().required(),
  ownerId: joi.string().required(),
  propertyManagerId: joi.string().required(),
  address: joi.object({
    street1: joi.string().required(),
    street2: joi.string().allow(null),
    city: joi.string().required(),
    state: joi.string().required(),
    zipCode: joi.string().required(),
    country: joi.string().required()
  }).required(),
  location: joi.object({
    latitude: joi.number().required(),
    longitude: joi.number().required()
  }).required(),
  yearBuilt: joi.number().required(),
  totalUnits: joi.number().required().min(1),
  amenities: joi.array().items(joi.string()),
  propertyFeatures: joi.array().items(joi.object()),
  images: joi.array().items(joi.object()),
  units: joi.array().items(joi.object()).min(1).required(),
  leaseTerms: joi.object().required(),
  propertyRules: joi.object().required(),
  accessibility: joi.object().required(),
  fairHousing: joi.object().required()
});

/**
 * Configures and returns Express router with listing endpoints
 * @param controller - Listing controller instance
 * @returns Configured Express router
 */
export const configureListingRoutes = (controller: ListingController): Router => {
  const router = Router();

  // Apply common middleware
  router.use(requestTracker);
  router.use(compression());

  // Search listings endpoint - public with rate limiting and caching
  router.get('/search',
    rateLimitMiddleware(RATE_LIMIT_CONFIG.search),
    validateRequest({ query: searchSchema }),
    cacheMiddleware(CACHE_TTL.search),
    async (req, res, next) => {
      try {
        const results = await controller.searchListings(req.query);
        res.json(results);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get listing by ID - public with caching
  router.get('/:id',
    validateRequest({ params: joi.object({ id: joi.string().required() }) }),
    cacheMiddleware(CACHE_TTL.detail),
    async (req, res, next) => {
      try {
        const listing = await controller.getListingById(req.params.id);
        res.json(listing);
      } catch (error) {
        next(error);
      }
    }
  );

  // Create listing - protected endpoint
  router.post('/',
    validateToken,
    validateRole(PROTECTED_ROLES),
    rateLimitMiddleware(RATE_LIMIT_CONFIG.create),
    validateRequest({ body: listingSchema }),
    async (req, res, next) => {
      try {
        const listing = await controller.createListing(req.body);
        res.status(201).json(listing);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update listing - protected endpoint
  router.put('/:id',
    validateToken,
    validateRole(PROTECTED_ROLES),
    rateLimitMiddleware(RATE_LIMIT_CONFIG.update),
    validateRequest({
      params: joi.object({ id: joi.string().required() }),
      body: listingSchema.fork(['units'], schema => schema.optional())
    }),
    async (req, res, next) => {
      try {
        const listing = await controller.updateListing(req.params.id, req.body);
        res.json(listing);
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete listing - protected endpoint
  router.delete('/:id',
    validateToken,
    validateRole(PROTECTED_ROLES),
    validateRequest({ params: joi.object({ id: joi.string().required() }) }),
    async (req, res, next) => {
      try {
        await controller.deleteListing(req.params.id);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    }
  );

  // Update listing availability - protected endpoint
  router.put('/:id/availability',
    validateToken,
    validateRole(PROTECTED_ROLES),
    validateRequest({
      params: joi.object({ id: joi.string().required() }),
      body: joi.object({
        status: joi.string().required().valid('ACTIVE', 'INACTIVE', 'PENDING', 'MAINTENANCE', 'RESERVED')
      })
    }),
    async (req, res, next) => {
      try {
        const listing = await controller.updateAvailability(req.params.id, req.body);
        res.json(listing);
      } catch (error) {
        next(error);
      }
    }
  );

  // Apply error handling middleware
  router.use(errorHandler);

  return router;
};