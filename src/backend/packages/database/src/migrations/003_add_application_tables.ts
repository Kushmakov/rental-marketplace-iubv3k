/**
 * @fileoverview Database migration for application-related tables with enhanced security and compliance
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { postgresConfig } from '../config';

// Global constants for migration configuration
const SCHEMA_VERSION = '3';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const AUDIT_SCHEMA = 'audit';
const PARTITION_INTERVAL = "INTERVAL '1 month'";

/**
 * Creates application-related tables with security features and optimizations
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS audit');

  // Create application status enum
  await knex.raw(`
    CREATE TYPE application_status AS ENUM (
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PENDING_DOCUMENTS',
      'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'
    )
  `);

  // Create document types table
  await knex.schema.createTable('document_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('description').notNullable();
    table.jsonb('validation_rules').notNullable();
    table.boolean('is_required').notNullable().defaultTo(false);
    table.integer('retention_period_days').notNullable();
    table.timestamps(true, true);
  });

  // Create applications table with partitioning
  await knex.raw(`
    CREATE TABLE applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      property_id UUID NOT NULL REFERENCES properties(id),
      unit_id UUID NOT NULL REFERENCES units(id),
      status application_status NOT NULL DEFAULT 'DRAFT',
      monthly_income DECIMAL(12,2) NOT NULL,
      desired_move_in_date DATE NOT NULL,
      encrypted_ssn BYTEA,
      ssn_iv BYTEA,
      encrypted_drivers_license BYTEA,
      drivers_license_iv BYTEA,
      credit_score INTEGER,
      background_check_status VARCHAR(50),
      review_notes TEXT,
      rejection_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    ) PARTITION BY RANGE (created_at)
  `);

  // Create initial partition
  await knex.raw(`
    CREATE TABLE applications_current PARTITION OF applications
    FOR VALUES FROM (CURRENT_DATE) TO (CURRENT_DATE + ${PARTITION_INTERVAL})
  `);

  // Create application documents table
  await knex.schema.createTable('application_documents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable().references('id').inTable('applications');
    table.uuid('document_type_id').notNullable().references('id').inTable('document_types');
    table.binary('encrypted_content').notNullable();
    table.binary('content_iv').notNullable();
    table.string('original_filename').notNullable();
    table.string('mime_type').notNullable();
    table.integer('version').notNullable().defaultTo(1);
    table.string('verification_status').notNullable().defaultTo('PENDING');
    table.timestamp('verified_at');
    table.uuid('verified_by');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
  });

  // Create application references table
  await knex.schema.createTable('application_references', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable().references('id').inTable('applications');
    table.string('name').notNullable();
    table.string('relationship').notNullable();
    table.binary('encrypted_phone').notNullable();
    table.binary('phone_iv').notNullable();
    table.binary('encrypted_email').notNullable();
    table.binary('email_iv').notNullable();
    table.string('verification_status').notNullable().defaultTo('PENDING');
    table.jsonb('verification_details');
    table.timestamps(true, true);
  });

  // Create employment verifications table
  await knex.schema.createTable('employment_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable().references('id').inTable('applications');
    table.string('employer_name').notNullable();
    table.binary('encrypted_contact_info').notNullable();
    table.binary('contact_info_iv').notNullable();
    table.decimal('annual_income', 12, 2).notNullable();
    table.date('employment_start_date').notNullable();
    table.date('employment_end_date');
    table.string('verification_status').notNullable().defaultTo('PENDING');
    table.jsonb('verification_details');
    table.timestamps(true, true);
  });

  // Create background checks table
  await knex.schema.createTable('background_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable().references('id').inTable('applications');
    table.string('provider').notNullable();
    table.string('status').notNullable();
    table.jsonb('results');
    table.string('report_url');
    table.timestamp('completed_at');
    table.timestamps(true, true);
  });

  // Create indexes
  await knex.raw(`
    CREATE INDEX idx_applications_status ON applications(status);
    CREATE INDEX idx_applications_user_property ON applications(user_id, property_id);
    CREATE INDEX idx_applications_dates ON applications(created_at, updated_at);
    CREATE INDEX idx_application_documents_type ON application_documents(document_type_id);
    CREATE INDEX idx_employment_verification_status ON employment_verifications(verification_status);
  `);

  // Create audit logging function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit.log_application_changes()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO ${AUDIT_SCHEMA}.audit_log (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        user_id
      ) VALUES (
        TG_TABLE_NAME,
        NEW.id,
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
        current_setting('app.current_user_id', TRUE)
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create audit triggers
  const auditTables = [
    'applications',
    'application_documents',
    'application_references',
    'employment_verifications',
    'background_checks'
  ];

  for (const table of auditTables) {
    await knex.raw(`
      CREATE TRIGGER ${table}_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION audit.log_application_changes();
    `);
  }

  // Create data retention policy
  await knex.raw(`
    CREATE OR REPLACE FUNCTION maintain_data_retention()
    RETURNS void AS $$
    BEGIN
      -- Soft delete old applications
      UPDATE applications
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE status = 'REJECTED'
      AND created_at < CURRENT_DATE - INTERVAL '2 years'
      AND deleted_at IS NULL;

      -- Clean up old documents
      UPDATE application_documents
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE created_at < CURRENT_DATE - INTERVAL '7 years'
      AND deleted_at IS NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

/**
 * Rolls back the application tables migration
 */
export async function down(knex: Knex): Promise<void> {
  // Drop audit triggers
  const auditTables = [
    'applications',
    'application_documents',
    'application_references',
    'employment_verifications',
    'background_checks'
  ];

  for (const table of auditTables) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table}`);
  }

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS audit.log_application_changes()');
  await knex.raw('DROP FUNCTION IF EXISTS maintain_data_retention()');

  // Drop tables in correct order
  await knex.schema.dropTableIfExists('background_checks');
  await knex.schema.dropTableIfExists('employment_verifications');
  await knex.schema.dropTableIfExists('application_references');
  await knex.schema.dropTableIfExists('application_documents');
  await knex.raw('DROP TABLE IF EXISTS applications CASCADE');
  await knex.schema.dropTableIfExists('document_types');

  // Drop custom types
  await knex.raw('DROP TYPE IF EXISTS application_status');

  // Clean up partitions
  await knex.raw('DROP TABLE IF EXISTS applications_current');
}