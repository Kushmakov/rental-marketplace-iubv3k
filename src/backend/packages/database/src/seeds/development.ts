/**
 * @fileoverview Development environment database seed file for Project X rental platform
 * Creates comprehensive test data across all system entities with proper relationships
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { faker } from '@faker-js/faker'; // v8.0.0
import bcrypt from 'bcryptjs'; // v2.4.3
import { pool } from '../config';
import { USER_ROLES, APPLICATION_STATUS, PAYMENT_STATUS } from '../../../common/src/constants';

// Global constants for seed configuration
const DEFAULT_PASSWORD = 'Password123!';
const SEED_COUNT = {
  USERS: 50,
  PROPERTIES: 100,
  UNITS: 300,
  APPLICATIONS: 200,
  PAYMENTS: 400,
  NOTIFICATIONS: 1000,
} as const;

/**
 * Main seed function that orchestrates the creation of all test data
 * @param knex - Knex instance for database operations
 */
export async function seed(knex: Knex): Promise<void> {
  try {
    // Begin transaction for data consistency
    await knex.transaction(async (trx) => {
      console.log('Starting database seed process...');

      // Clear existing data in reverse dependency order
      await trx('notifications').del();
      await trx('payments').del();
      await trx('applications').del();
      await trx('units').del();
      await trx('properties').del();
      await trx('users').del();

      // Seed core data
      const userIds = await seedUsers(trx);
      const { propertyIds, unitIds } = await seedProperties(trx, userIds);
      const applicationIds = await seedApplications(trx, userIds, unitIds);
      await seedPayments(trx, applicationIds);
      await seedNotifications(trx, userIds);

      console.log('Seed process completed successfully');
    });
  } catch (error) {
    console.error('Seed process failed:', error);
    throw error;
  }
}

/**
 * Creates test users across all roles with proper profile data
 * @param knex - Transaction object
 * @returns Array of created user IDs
 */
async function seedUsers(knex: Knex): Promise<string[]> {
  console.log('Seeding users...');
  const users = [];
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Create admin users
  users.push({
    id: faker.string.uuid(),
    email: 'admin@projectx.com',
    password_hash: hashedPassword,
    role: USER_ROLES.ADMIN,
    profile: {
      firstName: 'System',
      lastName: 'Administrator',
      phone: faker.phone.number(),
      company: 'Project X',
    },
    created_at: new Date(),
  });

  // Create users for each role
  for (let i = 0; i < SEED_COUNT.USERS; i++) {
    const role = faker.helpers.arrayElement(Object.values(USER_ROLES));
    users.push({
      id: faker.string.uuid(),
      email: faker.internet.email().toLowerCase(),
      password_hash: hashedPassword,
      role,
      profile: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number(),
        company: role === USER_ROLES.LANDLORD ? faker.company.name() : undefined,
        broker: role === USER_ROLES.AGENT ? faker.company.name() : undefined,
        preferences: {
          notifications: {
            email: true,
            sms: faker.datatype.boolean(),
            push: faker.datatype.boolean(),
          },
          searchPreferences: role === USER_ROLES.RENTER ? {
            priceRange: {
              min: faker.number.int({ min: 500, max: 2000 }),
              max: faker.number.int({ min: 2001, max: 5000 }),
            },
            bedrooms: faker.number.int({ min: 1, max: 4 }),
            bathrooms: faker.number.int({ min: 1, max: 3 }),
          } : undefined,
        },
      },
      created_at: faker.date.past(),
    });
  }

  await knex('users').insert(users);
  return users.map(u => u.id);
}

/**
 * Generates diverse property inventory with detailed features
 * @param knex - Transaction object
 * @param userIds - Available user IDs for relationships
 * @returns Created property and unit IDs
 */
async function seedProperties(knex: Knex, userIds: string[]): Promise<{ propertyIds: string[], unitIds: string[] }> {
  console.log('Seeding properties and units...');
  const properties = [];
  const units = [];
  const propertyIds: string[] = [];
  const unitIds: string[] = [];

  const landlordIds = await knex('users')
    .where('role', USER_ROLES.LANDLORD)
    .pluck('id');

  for (let i = 0; i < SEED_COUNT.PROPERTIES; i++) {
    const propertyId = faker.string.uuid();
    propertyIds.push(propertyId);

    properties.push({
      id: propertyId,
      owner_id: faker.helpers.arrayElement(landlordIds),
      name: faker.company.name() + ' Apartments',
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zip: faker.location.zipCode(),
        coordinates: {
          latitude: faker.location.latitude(),
          longitude: faker.location.longitude(),
        },
      },
      features: {
        yearBuilt: faker.number.int({ min: 1960, max: 2023 }),
        totalUnits: faker.number.int({ min: 10, max: 200 }),
        amenities: faker.helpers.arrayElements([
          'Pool', 'Gym', 'Parking', 'Pet Friendly', 'Laundry',
          'Security', 'Storage', 'Elevator', 'Rooftop'
        ], { min: 2, max: 6 }),
      },
      created_at: faker.date.past(),
    });

    // Create units for each property
    const unitCount = faker.number.int({ min: 1, max: 5 });
    for (let j = 0; j < unitCount; j++) {
      const unitId = faker.string.uuid();
      unitIds.push(unitId);

      units.push({
        id: unitId,
        property_id: propertyId,
        unit_number: `${faker.number.int({ min: 1, max: 99 })}${faker.string.alpha().toUpperCase()}`,
        features: {
          bedrooms: faker.number.int({ min: 0, max: 4 }),
          bathrooms: faker.number.int({ min: 1, max: 4 }),
          sqft: faker.number.int({ min: 500, max: 2500 }),
          rent: faker.number.int({ min: 800, max: 5000 }),
          deposit: faker.number.int({ min: 500, max: 2000 }),
          available_from: faker.date.future(),
          amenities: faker.helpers.arrayElements([
            'Dishwasher', 'Balcony', 'Walk-in Closet', 'Fireplace',
            'Central AC', 'Hardwood Floors'
          ], { min: 1, max: 4 }),
        },
        status: faker.helpers.arrayElement(['available', 'rented', 'maintenance']),
        created_at: faker.date.past(),
      });
    }
  }

  await knex('properties').insert(properties);
  await knex('units').insert(units);

  return { propertyIds, unitIds };
}

/**
 * Creates rental applications with complete documentation
 * @param knex - Transaction object
 * @param userIds - Available user IDs for relationships
 * @param unitIds - Available unit IDs for relationships
 * @returns Created application IDs
 */
async function seedApplications(knex: Knex, userIds: string[], unitIds: string[]): Promise<string[]> {
  console.log('Seeding applications...');
  const applications = [];
  const applicationIds: string[] = [];

  const renterIds = await knex('users')
    .where('role', USER_ROLES.RENTER)
    .pluck('id');

  for (let i = 0; i < SEED_COUNT.APPLICATIONS; i++) {
    const applicationId = faker.string.uuid();
    applicationIds.push(applicationId);

    applications.push({
      id: applicationId,
      user_id: faker.helpers.arrayElement(renterIds),
      unit_id: faker.helpers.arrayElement(unitIds),
      status: faker.helpers.arrayElement(Object.values(APPLICATION_STATUS)),
      application_data: {
        income: faker.number.int({ min: 30000, max: 150000 }),
        employment: {
          employer: faker.company.name(),
          position: faker.person.jobTitle(),
          startDate: faker.date.past().toISOString(),
          monthlyIncome: faker.number.int({ min: 2500, max: 12500 }),
        },
        creditScore: faker.number.int({ min: 580, max: 850 }),
        documents: {
          identification: {
            type: faker.helpers.arrayElement(['drivers_license', 'passport']),
            verified: faker.datatype.boolean(),
          },
          proofOfIncome: {
            type: faker.helpers.arrayElement(['paystubs', 'w2', 'tax_returns']),
            verified: faker.datatype.boolean(),
          },
        },
      },
      created_at: faker.date.past(),
      updated_at: faker.date.recent(),
    });
  }

  await knex('applications').insert(applications);
  return applicationIds;
}

/**
 * Sets up payment records with various payment methods
 * @param knex - Transaction object
 * @param applicationIds - Available application IDs for relationships
 */
async function seedPayments(knex: Knex, applicationIds: string[]): Promise<void> {
  console.log('Seeding payments...');
  const payments = [];

  for (let i = 0; i < SEED_COUNT.PAYMENTS; i++) {
    payments.push({
      id: faker.string.uuid(),
      application_id: faker.helpers.arrayElement(applicationIds),
      amount: faker.number.int({ min: 50, max: 5000 }),
      type: faker.helpers.arrayElement(['application_fee', 'deposit', 'rent']),
      status: faker.helpers.arrayElement(Object.values(PAYMENT_STATUS)),
      payment_method: {
        type: faker.helpers.arrayElement(['credit_card', 'bank_transfer', 'ach']),
        last4: faker.finance.creditCardNumber('####'),
        expiry: faker.helpers.arrayElement(['credit_card', 'bank_transfer']),
      },
      transaction_data: {
        processor_id: faker.string.alphanumeric(16),
        processor: 'stripe',
        timestamp: faker.date.recent().toISOString(),
      },
      created_at: faker.date.past(),
      updated_at: faker.date.recent(),
    });
  }

  await knex('payments').insert(payments);
}

/**
 * Creates notification records and preferences
 * @param knex - Transaction object
 * @param userIds - Available user IDs for relationships
 */
async function seedNotifications(knex: Knex, userIds: string[]): Promise<void> {
  console.log('Seeding notifications...');
  const notifications = [];

  for (let i = 0; i < SEED_COUNT.NOTIFICATIONS; i++) {
    notifications.push({
      id: faker.string.uuid(),
      user_id: faker.helpers.arrayElement(userIds),
      type: faker.helpers.arrayElement([
        'application_update', 'payment_received', 'document_request',
        'message_received', 'viewing_scheduled', 'maintenance_update'
      ]),
      content: {
        title: faker.helpers.arrayElement([
          'Application Status Updated',
          'Payment Confirmation',
          'New Message Received',
          'Document Request',
          'Viewing Confirmation'
        ]),
        message: faker.lorem.sentence(),
        data: {
          entityId: faker.string.uuid(),
          entityType: faker.helpers.arrayElement(['application', 'payment', 'message']),
        },
      },
      status: faker.helpers.arrayElement(['unread', 'read', 'archived']),
      created_at: faker.date.recent(),
      read_at: faker.helpers.arrayElement([null, faker.date.recent()]),
    });
  }

  await knex('notifications').insert(notifications);
}

export default seed;