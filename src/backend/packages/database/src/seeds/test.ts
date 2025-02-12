/**
 * @fileoverview Test database seed file for Project X rental platform
 * Generates comprehensive test data for development and testing environments
 * @version 1.0.0
 */

import { Knex } from 'knex'; // ^2.5.0
import { faker } from '@faker-js/faker'; // ^8.0.0
import * as bcrypt from 'bcrypt'; // ^5.1.0
import { DATABASE_CONFIG, initializeKnex } from '../config';
import { USER_ROLES, APPLICATION_STATUS, PAYMENT_STATUS } from '../../../common/src/constants';

// Global constants for test data generation
const TEST_USER_PASSWORD = 'Password123!';
const NUM_TEST_PROPERTIES = 50;
const NUM_TEST_USERS = 20;
const SALT_ROUNDS = 10;
const TEST_DATA_VERSION = '1.0.0';

/**
 * Creates test user accounts with various roles and profiles
 * @param knex - Knex instance for database operations
 * @returns Array of created user IDs
 */
async function seedUsers(knex: Knex): Promise<string[]> {
  const hashedPassword = await bcrypt.hash(TEST_USER_PASSWORD, SALT_ROUNDS);
  const userIds: string[] = [];

  // Create admin user
  const adminId = faker.string.uuid();
  await knex('users').insert({
    id: adminId,
    email: 'admin@projectx.com',
    password_hash: hashedPassword,
    role: USER_ROLES.ADMIN,
    profile: {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phone: faker.phone.number(),
      avatar: faker.image.avatar(),
      verified: true,
      createdAt: faker.date.past(),
      preferences: {
        notifications: true,
        newsletter: true,
        language: 'en'
      }
    }
  });
  userIds.push(adminId);

  // Create property managers
  for (let i = 0; i < 5; i++) {
    const managerId = faker.string.uuid();
    await knex('users').insert({
      id: managerId,
      email: faker.internet.email(),
      password_hash: hashedPassword,
      role: USER_ROLES.LANDLORD,
      profile: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number(),
        avatar: faker.image.avatar(),
        verified: true,
        createdAt: faker.date.past(),
        company: faker.company.name(),
        license: faker.string.alphanumeric(10),
        preferences: {
          notifications: true,
          autoApprove: false,
          paymentReminders: true
        }
      }
    });
    userIds.push(managerId);
  }

  // Create regular users
  for (let i = 0; i < NUM_TEST_USERS - 6; i++) {
    const userId = faker.string.uuid();
    await knex('users').insert({
      id: userId,
      email: faker.internet.email(),
      password_hash: hashedPassword,
      role: USER_ROLES.RENTER,
      profile: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number(),
        avatar: faker.image.avatar(),
        verified: faker.datatype.boolean(),
        createdAt: faker.date.past(),
        preferences: {
          notifications: true,
          searchAlerts: true,
          maxRent: faker.number.int({ min: 1000, max: 5000 })
        }
      }
    });
    userIds.push(userId);
  }

  return userIds;
}

/**
 * Creates test properties with comprehensive details and units
 * @param knex - Knex instance for database operations
 * @param managerIds - Array of property manager user IDs
 */
async function seedProperties(knex: Knex, managerIds: string[]): Promise<void> {
  for (let i = 0; i < NUM_TEST_PROPERTIES; i++) {
    const propertyId = faker.string.uuid();
    const managerId = managerIds[faker.number.int({ min: 0, max: managerIds.length - 1 })];

    // Create property
    await knex('properties').insert({
      id: propertyId,
      owner_id: managerId,
      name: faker.company.name() + ' Apartments',
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        coordinates: {
          latitude: faker.location.latitude(),
          longitude: faker.location.longitude()
        }
      },
      details: {
        yearBuilt: faker.number.int({ min: 1960, max: 2023 }),
        totalUnits: faker.number.int({ min: 10, max: 100 }),
        amenities: [
          'Parking',
          'Pool',
          'Gym',
          'Pet Friendly',
          'Laundry'
        ].filter(() => faker.datatype.boolean()),
        images: Array(5).fill(null).map(() => ({
          url: faker.image.urlLoremFlickr({ category: 'apartment' }),
          caption: faker.lorem.sentence()
        })),
        description: faker.lorem.paragraphs(3),
        policies: {
          petsAllowed: faker.datatype.boolean(),
          smokingAllowed: faker.datatype.boolean(),
          securityDeposit: faker.number.int({ min: 500, max: 2000 })
        }
      },
      created_at: faker.date.past(),
      updated_at: faker.date.recent()
    });

    // Create units for property
    const numUnits = faker.number.int({ min: 5, max: 15 });
    for (let j = 0; j < numUnits; j++) {
      await knex('units').insert({
        id: faker.string.uuid(),
        property_id: propertyId,
        unit_number: `${faker.number.int({ min: 1, max: 9 })}${faker.string.numeric(2)}`,
        details: {
          bedrooms: faker.number.int({ min: 0, max: 3 }),
          bathrooms: faker.number.int({ min: 1, max: 3 }),
          sqft: faker.number.int({ min: 500, max: 2000 }),
          rent: faker.number.int({ min: 1000, max: 5000 }),
          available: faker.datatype.boolean(),
          availableDate: faker.date.future(),
          features: [
            'Dishwasher',
            'Central AC',
            'Balcony',
            'Hardwood Floors',
            'Walk-in Closet'
          ].filter(() => faker.datatype.boolean()),
          images: Array(3).fill(null).map(() => ({
            url: faker.image.urlLoremFlickr({ category: 'apartment' }),
            caption: faker.lorem.sentence()
          })),
          floorPlan: faker.image.urlLoremFlickr({ category: 'architecture' })
        },
        created_at: faker.date.past()
      });
    }
  }
}

/**
 * Creates test rental applications with various statuses and documents
 * @param knex - Knex instance for database operations
 * @param userIds - Array of user IDs for application creation
 */
async function seedApplications(knex: Knex, userIds: string[]): Promise<void> {
  const units = await knex('units').select('id', 'property_id', 'details');

  for (const userId of userIds) {
    if (faker.datatype.boolean()) {
      const unit = units[faker.number.int({ min: 0, max: units.length - 1 })];
      const applicationId = faker.string.uuid();

      await knex('applications').insert({
        id: applicationId,
        user_id: userId,
        unit_id: unit.id,
        property_id: unit.property_id,
        status: faker.helpers.arrayElement(Object.values(APPLICATION_STATUS)),
        details: {
          moveInDate: faker.date.future(),
          leaseTerm: faker.helpers.arrayElement([6, 12, 18, 24]),
          monthlyIncome: faker.number.int({ min: 3000, max: 15000 }),
          creditScore: faker.number.int({ min: 300, max: 850 }),
          occupants: faker.number.int({ min: 1, max: 4 }),
          pets: faker.datatype.boolean() ? [{
            type: faker.animal.type(),
            breed: faker.animal.dog(),
            weight: faker.number.int({ min: 5, max: 100 })
          }] : [],
          documents: [
            {
              type: 'ID',
              url: faker.internet.url(),
              verified: true
            },
            {
              type: 'PayStub',
              url: faker.internet.url(),
              verified: faker.datatype.boolean()
            },
            {
              type: 'RentalHistory',
              url: faker.internet.url(),
              verified: faker.datatype.boolean()
            }
          ],
          backgroundCheck: {
            status: 'completed',
            passed: faker.datatype.boolean(),
            date: faker.date.recent()
          }
        },
        created_at: faker.date.past(),
        updated_at: faker.date.recent()
      });

      // Create payment records
      await knex('payments').insert({
        id: faker.string.uuid(),
        application_id: applicationId,
        user_id: userId,
        amount: faker.number.int({ min: 25, max: 75 }),
        status: faker.helpers.arrayElement(Object.values(PAYMENT_STATUS)),
        type: 'application_fee',
        details: {
          processor: 'stripe',
          transactionId: faker.string.alphanumeric(24),
          date: faker.date.recent()
        },
        created_at: faker.date.recent()
      });
    }
  }
}

/**
 * Main seed function that orchestrates the entire seeding process
 * @param knex - Knex instance for database operations
 */
export async function seed(knex: Knex): Promise<void> {
  try {
    // Begin transaction
    await knex.transaction(async (trx) => {
      // Clear existing test data
      await trx('payments').del();
      await trx('applications').del();
      await trx('units').del();
      await trx('properties').del();
      await trx('users').del();

      // Create test data
      console.log('Seeding users...');
      const userIds = await seedUsers(trx);

      console.log('Seeding properties...');
      const managerIds = userIds.slice(0, 5);
      await seedProperties(trx, managerIds);

      console.log('Seeding applications...');
      const renterIds = userIds.slice(6);
      await seedApplications(trx, renterIds);

      // Create seed version record
      await trx('metadata').insert({
        key: 'test_seed_version',
        value: TEST_DATA_VERSION,
        updated_at: new Date()
      });

      console.log('Seeding completed successfully');
    });
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}