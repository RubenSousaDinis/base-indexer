import { Pool, PoolClient } from 'pg';
import { Migration, MigrationContext } from './types.js';
import { migration as initialSchema } from './000_initial_schema.js';

const migrations: Migration[] = [
  initialSchema,
];

export async function runMigrations(client: PoolClient) {
  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get executed migrations
    const { rows: executedMigrations } = await client.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const executedMigrationNames = new Set(executedMigrations.map(m => m.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedMigrationNames.has(migration.name)) {
        console.log(`Running migration: ${migration.name}`);
        
        try {
          const context: MigrationContext = {
            client,
            releaseClient: false // Tell migrations not to release the client
          };

          await migration.up(context);
          
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migration.name]
          );
          
          console.log(`Completed migration: ${migration.name}`);
        } catch (error) {
          console.error(`Migration ${migration.name} failed:`, error);
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Migration process failed:', error);
    throw error;
  }
}

export async function rollbackMigration(client: PoolClient, migrationName: string) {
  try {
    const migration = migrations.find(m => m.name === migrationName);
    if (!migration) {
      throw new Error(`Migration ${migrationName} not found`);
    }

    const context: MigrationContext = {
      client,
      releaseClient: false // Tell migrations not to release the client
    };

    await migration.down(context);
    
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