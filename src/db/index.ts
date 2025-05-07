import { Pool } from 'pg';
import { runMigrations } from './migrations/runner.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Debug log the database configuration
console.log('Database configuration:', {
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  ssl: process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled'
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false // Required for RDS SSL connection
  } : false
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error executing query', { text, error });
    throw error;
  }
};

export const getClient = () => pool.connect();

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Run migrations
    await runMigrations(client);
    console.log('Database initialized successfully');
    return client; // Return the client for the caller to manage
  } catch (error) {
    console.error('Failed to initialize database:', error);
    client.release();
    throw error;
  }
}

export { pool }; 