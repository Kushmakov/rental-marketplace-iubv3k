/**
 * @fileoverview Database migration for enhanced notification system
 * Creates tables and relationships for notification management with comprehensive tracking
 * @version 1.0.0
 */

import { Knex } from 'knex'; // v2.5.0
import { postgresConfig } from '../config';

// Global constants for notification system
const SCHEMA_VERSION = '5';
const NOTIFICATION_TYPES = ['email', 'sms', 'in_app', 'push', 'web_push'];
const NOTIFICATION_STATUSES = ['draft', 'pending', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'archived'];
const TEMPLATE_TYPES = ['plain_text', 'html', 'markdown', 'rich_text'];

/**
 * Creates the enhanced notification system schema
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Create notification_types table
    await trx.schema.createTable('notification_types', (table) => {
      table.string('type').primary();
      table.string('display_name').notNullable();
      table.jsonb('config').notNullable().defaultTo('{}');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);
    });

    // Create notification_statuses table
    await trx.schema.createTable('notification_statuses', (table) => {
      table.string('status').primary();
      table.string('display_name').notNullable();
      table.string('description').notNullable();
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
    });

    // Create notification_templates table
    await trx.schema.createTable('notification_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.string('description');
      table.string('type').notNullable().references('type').inTable('notification_types');
      table.string('template_type').notNullable().checkIn(TEMPLATE_TYPES);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('current_version').notNullable().defaultTo(1);
      table.jsonb('variables').notNullable().defaultTo('[]');
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
      table.unique(['name', 'type']);
    });

    // Create template_versions table
    await trx.schema.createTable('template_versions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('template_id').notNullable().references('id').inTable('notification_templates').onDelete('CASCADE');
      table.integer('version').notNullable();
      table.text('content').notNullable();
      table.text('subject');
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.string('created_by').notNullable();
      table.timestamps(true, true);
      table.unique(['template_id', 'version']);
    });

    // Create notifications table
    await trx.schema.createTable('notifications', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('template_version_id').notNullable().references('id').inTable('template_versions');
      table.uuid('user_id').notNullable();
      table.string('status').notNullable().references('status').inTable('notification_statuses');
      table.jsonb('data').notNullable();
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamp('scheduled_for');
      table.timestamp('processed_at');
      table.timestamp('delivered_at');
      table.integer('retry_count').notNullable().defaultTo(0);
      table.timestamp('next_retry_at');
      table.text('error_message');
      table.timestamps(true, true);
    });

    // Create notification_preferences table
    await trx.schema.createTable('notification_preferences', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable();
      table.string('notification_type').notNullable().references('type').inTable('notification_types');
      table.boolean('enabled').notNullable().defaultTo(true);
      table.jsonb('channels').notNullable().defaultTo('[]');
      table.jsonb('schedule').notNullable().defaultTo('{}');
      table.timestamps(true, true);
      table.unique(['user_id', 'notification_type']);
    });

    // Create notification_delivery_logs table
    await trx.schema.createTable('notification_delivery_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('notification_id').notNullable().references('id').inTable('notifications').onDelete('CASCADE');
      table.string('status').notNullable();
      table.timestamp('attempted_at').notNullable();
      table.text('response');
      table.text('error_message');
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
    });

    // Create notification_batches table
    await trx.schema.createTable('notification_batches', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('status').notNullable();
      table.integer('total_count').notNullable();
      table.integer('processed_count').notNullable().defaultTo(0);
      table.integer('success_count').notNullable().defaultTo(0);
      table.integer('failure_count').notNullable().defaultTo(0);
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
    });

    // Create indexes for optimized querying
    await trx.raw(`
      CREATE INDEX idx_notifications_user_status ON notifications (user_id, status);
      CREATE INDEX idx_notifications_scheduled ON notifications (scheduled_for) WHERE status = 'pending';
      CREATE INDEX idx_notifications_retry ON notifications (next_retry_at) WHERE status = 'failed';
      CREATE INDEX idx_delivery_logs_notification ON notification_delivery_logs (notification_id, attempted_at);
      CREATE INDEX idx_templates_active ON notification_templates (is_active) WHERE is_active = true;
    `);

    // Create trigger for status change auditing
    await trx.raw(`
      CREATE OR REPLACE FUNCTION log_notification_status_change()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO notification_delivery_logs (
          notification_id, status, attempted_at, metadata
        ) VALUES (
          NEW.id, NEW.status, CURRENT_TIMESTAMP, 
          jsonb_build_object('previous_status', OLD.status)
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER notification_status_change
      AFTER UPDATE OF status ON notifications
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION log_notification_status_change();
    `);

    // Insert default notification types
    await trx('notification_types').insert(
      NOTIFICATION_TYPES.map(type => ({
        type,
        display_name: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
        config: {},
      }))
    );

    // Insert default notification statuses
    await trx('notification_statuses').insert(
      NOTIFICATION_STATUSES.map(status => ({
        status,
        display_name: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
        description: `Notification is in ${status} state`,
      }))
    );
  });
}

/**
 * Rolls back the notification system schema
 */
export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Drop triggers
    await trx.raw('DROP TRIGGER IF EXISTS notification_status_change ON notifications');
    await trx.raw('DROP FUNCTION IF EXISTS log_notification_status_change');

    // Drop tables in correct order
    await trx.schema.dropTableIfExists('notification_delivery_logs');
    await trx.schema.dropTableIfExists('notification_batches');
    await trx.schema.dropTableIfExists('notification_preferences');
    await trx.schema.dropTableIfExists('notifications');
    await trx.schema.dropTableIfExists('template_versions');
    await trx.schema.dropTableIfExists('notification_templates');
    await trx.schema.dropTableIfExists('notification_statuses');
    await trx.schema.dropTableIfExists('notification_types');
  });
}