import { PoolClient } from 'pg';
import * as initialSchema from './000_initial_schema.js';

const migrations = [
  {
    name: '000_initial_schema',
    up: initialSchema.up,
    down: initialSchema.down
  }
];

export async function runMigrations(client: PoolClient) {
  try {
    await client.query('BEGIN');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run each migration that hasn't been executed yet
    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT name FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (rows.length === 0) {
        console.log(`Running migration: ${migration.name}`);
        await migration.up(client);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        console.log(`Completed migration: ${migration.name}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function rollbackMigration(client: PoolClient, migrationName: string) {
  try {
    const migration = migrations.find(m => m.name === migrationName);
    if (!migration) {
      throw new Error(`Migration ${migrationName} not found`);
    }

    await migration.down(client);
    
    await client.query(
      'DELETE FROM migrations WHERE name = $1',
      [migrationName]
    );
    
    console.log(`Rolled back migration: ${migrationName}`);
  } catch (error) {
    console.error(`Rollback of migration ${migrationName} failed:`, error);
    throw error;
  }
} 