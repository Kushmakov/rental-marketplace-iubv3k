/**
 * @fileoverview Initial database migration establishing core user-related tables and authentication schema
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { USER_ROLES } from '../../../../common/src/constants';

// Global constants for schema constraints
const SCHEMA_VERSION = '1.0.0';
const MAX_USERNAME_LENGTH = 50;
const MAX_EMAIL_LENGTH = 255;
const PASSWORD_HASH_LENGTH = 60;

/**
 * Creates the initial database schema with comprehensive user-related tables,
 * security features, and audit logging capabilities
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "citext"');

  // Create custom types
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
      CREATE TYPE auth_provider AS ENUM ('local', 'google', 'apple', 'facebook');
      CREATE TYPE mfa_type AS ENUM ('totp', 'sms', 'email');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Users table with enhanced security features
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.specificType('email', `citext NOT NULL CHECK (length(email) <= ${MAX_EMAIL_LENGTH})`);
    table.string('username', MAX_USERNAME_LENGTH).unique().notNullable();
    table.string('password_hash', PASSWORD_HASH_LENGTH);
    table.specificType('status', 'user_status').notNullable().defaultTo('inactive');
    table.specificType('auth_provider', 'auth_provider').notNullable().defaultTo('local');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('email_verified_at').nullable();
    table.timestamp('last_login').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for performance
    table.index(['email'], 'users_email_idx');
    table.index(['status'], 'users_status_idx');
    table.index(['auth_provider'], 'users_auth_provider_idx');
  });

  // User profiles with extended information
  await knex.schema.createTable('user_profiles', (table) => {
    table.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    table.string('first_name').nullable();
    table.string('last_name').nullable();
    table.string('phone').nullable();
    table.jsonb('address').nullable();
    table.jsonb('preferences').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['phone'], 'user_profiles_phone_idx');
  });

  // Roles table for RBAC
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable().unique();
    table.jsonb('permissions').notNullable().defaultTo('[]');
    table.string('description').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // User roles junction table with temporal tracking
  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE');
    table.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('revoked_at').nullable();
    table.uuid('granted_by').references('id').inTable('users').nullable();
    
    table.primary(['user_id', 'role_id']);
    table.index(['granted_at'], 'user_roles_granted_at_idx');
  });

  // Sessions table with enhanced security
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash').notNullable();
    table.jsonb('device_info').notNullable().defaultTo('{}');
    table.inet('ip_address').nullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_used_at').notNullable().defaultTo(knex.fn.now());
    
    table.index(['user_id', 'expires_at'], 'sessions_user_expiry_idx');
    table.index(['token_hash'], 'sessions_token_hash_idx');
  });

  // MFA settings
  await knex.schema.createTable('mfa_settings', (table) => {
    table.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    table.specificType('mfa_type', 'mfa_type').notNullable();
    table.string('secret_hash').notNullable();
    table.boolean('is_enabled').notNullable().defaultTo(false);
    table.timestamp('enabled_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Password reset tokens with security controls
  await knex.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash').notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.boolean('used').notNullable().defaultTo(false);
    
    table.index(['token_hash'], 'password_reset_tokens_hash_idx');
    table.index(['user_id', 'expires_at'], 'password_reset_tokens_user_expiry_idx');
  });

  // Audit logs for security tracking
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id').nullable();
    table.jsonb('changes').nullable();
    table.inet('ip_address').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    table.index(['user_id', 'created_at'], 'audit_logs_user_time_idx');
    table.index(['entity_type', 'entity_id'], 'audit_logs_entity_idx');
  });

  // Create audit trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_trigger_func()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        changes,
        metadata
      )
      VALUES (
        current_setting('app.current_user_id', true)::uuid,
        TG_OP,
        TG_TABLE_NAME,
        NEW.id,
        jsonb_build_object(
          'old', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE null END,
          'new', CASE WHEN TG_OP = 'DELETE' THEN null ELSE row_to_json(NEW)::jsonb END
        ),
        '{}'::jsonb
      );
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Add audit triggers to sensitive tables
  const auditedTables = ['users', 'user_roles', 'mfa_settings'];
  for (const table of auditedTables) {
    await knex.raw(`
      CREATE TRIGGER ${table}_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
    `);
  }

  // Insert default roles
  await knex('roles').insert(
    Object.values(USER_ROLES).map(role => ({
      name: role,
      permissions: JSON.stringify([]),
      description: `Default ${role.toLowerCase()} role`
    }))
  );
}

/**
 * Rolls back the initial schema migration
 */
export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  const auditedTables = ['users', 'user_roles', 'mfa_settings'];
  for (const table of auditedTables) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table}`);
  }

  // Drop trigger function
  await knex.raw('DROP FUNCTION IF EXISTS audit_trigger_func() CASCADE');

  // Drop tables in reverse order
  await knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('password_reset_tokens')
    .dropTableIfExists('mfa_settings')
    .dropTableIfExists('sessions')
    .dropTableIfExists('user_roles')
    .dropTableIfExists('roles')
    .dropTableIfExists('user_profiles')
    .dropTableIfExists('users');

  // Drop custom types
  await knex.raw(`
    DROP TYPE IF EXISTS mfa_type CASCADE;
    DROP TYPE IF EXISTS auth_provider CASCADE;
    DROP TYPE IF EXISTS user_status CASCADE;
  `);

  // Drop extensions if no other migrations need them
  await knex.raw(`
    DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
    DROP EXTENSION IF EXISTS "pgcrypto" CASCADE;
    DROP EXTENSION IF EXISTS "citext" CASCADE;
  `);
}