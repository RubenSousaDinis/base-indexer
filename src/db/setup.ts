import { Pool } from 'pg';
import dotenv from 'dotenv';
import { runMigrations } from './migrations/runner.js';

dotenv.config();

async function createDatabase() {
  // Connect to default postgres database to create our database
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres', // Connect to default database
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    // Check if database exists
    const result = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.POSTGRES_DB]
    );

    if (result.rowCount === 0) {
      console.log(`Creating database ${process.env.POSTGRES_DB}...`);
      await pool.query(`CREATE DATABASE ${process.env.POSTGRES_DB}`);
      console.log('Database created successfully');
    } else {
      console.log(`Database ${process.env.POSTGRES_DB} already exists`);
    }
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function initializeSchema() {
  // Connect to our database
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });

  const client = await pool.connect();
  try {
    console.log('Dropping all existing tables...');
    await client.query('DROP TABLE IF EXISTS contract_interactions CASCADE');
    await client.query('DROP TABLE IF EXISTS contracts CASCADE');
    await client.query('DROP TABLE IF EXISTS blocks CASCADE');
    await client.query('DROP TABLE IF EXISTS transactions CASCADE');
    await client.query('DROP TABLE IF EXISTS events CASCADE');
    await client.query('DROP TABLE IF EXISTS migrations CASCADE');
    console.log('All tables dropped successfully');

    console.log('Initializing database schema...');
    await runMigrations(client);
    console.log('Schema initialized successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

async function setup() {
  try {
    await createDatabase();
    await initializeSchema();
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setup();
}

export { setup }; 