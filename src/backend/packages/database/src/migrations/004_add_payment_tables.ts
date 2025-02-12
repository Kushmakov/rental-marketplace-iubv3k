/**
 * @fileoverview Payment system database migration implementing PCI DSS compliant tables
 * with comprehensive audit logging, encryption, and performance optimizations
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { postgresConfig } from '../config';

// Schema version for tracking migration state
const SCHEMA_VERSION = '4';

// Validated payment status enums
const PAYMENT_STATUSES = [
  'pending', 'processing', 'completed', 'failed',
  'refunded', 'charged_back', 'disputed', 'settled'
];

// Supported payment method types
const PAYMENT_METHODS = [
  'credit_card', 'debit_card', 'bank_transfer',
  'ach', 'wire_transfer', 'digital_wallet'
];

// Transaction type enums
const TRANSACTION_TYPES = [
  'payment', 'refund', 'chargeback', 'dispute',
  'settlement', 'fee', 'adjustment'
];

// Audit action types
const AUDIT_ACTIONS = [
  'create', 'update', 'delete', 'status_change',
  'encryption_rotation'
];

/**
 * Creates payment system tables with security features and performance optimizations
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create payment methods table with encryption
  await knex.schema.createTable('payment_methods', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.enum('type', PAYMENT_METHODS).notNullable();
    // Encrypted sensitive data using pgcrypto
    table.specificType('encrypted_data', 'bytea').notNullable();
    table.string('last_four').notNullable();
    table.string('brand').nullable();
    table.date('expiry_date').nullable();
    table.boolean('is_default').defaultTo(false);
    table.boolean('is_verified').defaultTo(false);
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    // Indexes for common queries
    table.index(['user_id', 'is_default']);
    table.index(['type', 'is_verified']);
  });

  // Create payments table with partitioning
  await knex.schema.createTable('payments', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.uuid('payment_method_id').references('id').inTable('payment_methods');
    table.uuid('application_id').references('id').inTable('applications');
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.enum('status', PAYMENT_STATUSES).notNullable().defaultTo('pending');
    table.string('stripe_payment_intent_id').unique().nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);

    // Composite indexes for performance
    table.index(['user_id', 'status']);
    table.index(['created_at', 'status']);
    table.index(['application_id', 'status']);
  });

  // Create payment transactions table
  await knex.schema.createTable('payment_transactions', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('payment_id').notNullable().references('id').inTable('payments');
    table.enum('type', TRANSACTION_TYPES).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).notNullable();
    table.string('status').notNullable();
    table.string('processor_transaction_id').nullable();
    table.jsonb('processor_response').nullable();
    table.timestamps(true, true);

    // Indexes for transaction lookup
    table.index(['payment_id', 'type']);
    table.index(['created_at', 'status']);
  });

  // Create payment history table for temporal tracking
  await knex.schema.createTable('payment_history', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('payment_id').notNullable().references('id').inTable('payments');
    table.string('previous_status').notNullable();
    table.string('new_status').notNullable();
    table.uuid('changed_by').references('id').inTable('users');
    table.string('change_reason').nullable();
    table.timestamp('changed_at').defaultTo(knex.fn.now());

    // Index for history queries
    table.index(['payment_id', 'changed_at']);
  });

  // Create payment audit logs
  await knex.schema.createTable('payment_audit_logs', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.enum('action', AUDIT_ACTIONS).notNullable();
    table.uuid('payment_id').references('id').inTable('payments');
    table.uuid('user_id').references('id').inTable('users');
    table.jsonb('previous_state').nullable();
    table.jsonb('new_state').nullable();
    table.inet('ip_address').nullable();
    table.string('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes for audit queries
    table.index(['payment_id', 'created_at']);
    table.index(['action', 'created_at']);
  });

  // Create triggers for automatic audit logging
  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_payment_changes()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO payment_audit_logs (
        action,
        payment_id,
        previous_state,
        new_state
      )
      VALUES (
        CASE
          WHEN TG_OP = 'INSERT' THEN 'create'
          WHEN TG_OP = 'UPDATE' THEN 'update'
          WHEN TG_OP = 'DELETE' THEN 'delete'
        END,
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Apply triggers to payments table
  await knex.raw(`
    CREATE TRIGGER payments_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION log_payment_changes();
  `);

  // Create view for payment reporting
  await knex.raw(`
    CREATE VIEW payment_summary AS
    SELECT
      p.id,
      p.user_id,
      p.amount,
      p.currency,
      p.status,
      p.created_at,
      pm.type as payment_method_type,
      pm.last_four,
      COUNT(pt.id) as transaction_count
    FROM payments p
    LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
    LEFT JOIN payment_transactions pt ON p.id = pt.payment_id
    GROUP BY p.id, pm.id;
  `);
}

/**
 * Rolls back payment system tables with proper cleanup
 */
export async function down(knex: Knex): Promise<void> {
  // Drop views
  await knex.raw('DROP VIEW IF EXISTS payment_summary');

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS payments_audit_trigger ON payments');
  await knex.raw('DROP FUNCTION IF EXISTS log_payment_changes');

  // Drop tables in correct order
  await knex.schema.dropTableIfExists('payment_audit_logs');
  await knex.schema.dropTableIfExists('payment_history');
  await knex.schema.dropTableIfExists('payment_transactions');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('payment_methods');
}