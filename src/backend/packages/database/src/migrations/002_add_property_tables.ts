/**
 * @fileoverview Database migration for property-related tables with spatial capabilities
 * Creates comprehensive schema for properties, units, amenities with audit logging
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { pool } from '../config';

/**
 * Creates property-related tables with enhanced spatial and audit capabilities
 */
export async function up(knex: Knex): Promise<void> {
  // Enable PostGIS extension for spatial capabilities
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');

  // Create property types lookup table
  await knex.schema.createTable('property_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().unique();
    table.string('description').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Create property statuses lookup table
  await knex.schema.createTable('property_statuses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().unique();
    table.string('description').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Create main properties table with spatial support
  await knex.schema.createTable('properties', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('property_type_id').notNullable().references('id').inTable('property_types');
    table.uuid('status_id').notNullable().references('id').inTable('property_statuses');
    table.string('name').notNullable();
    table.text('description');
    table.integer('year_built');
    table.decimal('total_area', 10, 2);
    table.integer('total_units');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_featured').notNullable().defaultTo(false);
    table.jsonb('metadata');
    table.timestamps(true, true);
    table.timestamp('deleted_at');

    // Add spatial column for property location
    knex.raw(`
      SELECT AddGeometryColumn('properties', 'location', 4326, 'POINT', 2);
      CREATE INDEX idx_properties_location ON properties USING GIST(location);
    `);
  });

  // Create property addresses table
  await knex.schema.createTable('property_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('street_address').notNullable();
    table.string('unit_number');
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('postal_code').notNullable();
    table.string('country').notNullable().defaultTo('US');
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.boolean('is_primary').notNullable().defaultTo(true);
    table.timestamps(true, true);

    // Create spatial index for address locations
    table.index(['latitude', 'longitude'], 'idx_property_addresses_coords');
  });

  // Create property images table
  await knex.schema.createTable('property_images', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('url').notNullable();
    table.string('cdn_url').notNullable();
    table.string('thumbnail_url');
    table.string('caption');
    table.integer('display_order').notNullable().defaultTo(0);
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.jsonb('metadata');
    table.timestamps(true, true);
  });

  // Create units table
  await knex.schema.createTable('units', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('unit_number').notNullable();
    table.integer('bedrooms').notNullable();
    table.integer('bathrooms').notNullable();
    table.decimal('area', 10, 2);
    table.decimal('base_rent', 10, 2).notNullable();
    table.string('floor_plan_url');
    table.date('available_from');
    table.date('available_until');
    table.boolean('is_available').notNullable().defaultTo(true);
    table.jsonb('features');
    table.timestamps(true, true);
    table.timestamp('deleted_at');

    // Composite index for common unit queries
    table.index(['property_id', 'unit_number'], 'idx_units_property_unit');
    table.index(['is_available', 'available_from'], 'idx_units_availability');
  });

  // Create amenities table
  await knex.schema.createTable('amenities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().unique();
    table.string('description');
    table.string('category').notNullable();
    table.string('icon_url');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Create property amenities junction table
  await knex.schema.createTable('property_amenities', (table) => {
    table.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.uuid('amenity_id').notNullable().references('id').inTable('amenities').onDelete('CASCADE');
    table.text('notes');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.primary(['property_id', 'amenity_id']);
  });

  // Create unit amenities junction table
  await knex.schema.createTable('unit_amenities', (table) => {
    table.uuid('unit_id').notNullable().references('id').inTable('units').onDelete('CASCADE');
    table.uuid('amenity_id').notNullable().references('id').inTable('amenities').onDelete('CASCADE');
    table.text('notes');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.primary(['unit_id', 'amenity_id']);
  });

  // Create audit triggers for all tables
  const tables = [
    'properties',
    'property_addresses',
    'property_images',
    'units',
    'amenities',
    'property_amenities',
    'unit_amenities'
  ];

  for (const tableName of tables) {
    await knex.raw(`
      CREATE TRIGGER ${tableName}_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION audit.process_audit();
    `);
  }
}

/**
 * Rolls back property-related tables migration
 */
export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle dependencies
  const tables = [
    'unit_amenities',
    'property_amenities',
    'amenities',
    'units',
    'property_images',
    'property_addresses',
    'properties',
    'property_statuses',
    'property_types'
  ];

  // Drop audit triggers first
  for (const tableName of tables) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${tableName}_audit_trigger ON ${tableName}`);
  }

  // Drop tables
  for (const tableName of tables) {
    await knex.schema.dropTableIfExists(tableName);
  }

  // Drop spatial extensions if no longer needed
  await knex.raw('DROP EXTENSION IF EXISTS postgis CASCADE');
  await knex.raw('DROP EXTENSION IF EXISTS btree_gist CASCADE');
}