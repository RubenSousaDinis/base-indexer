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
  ssl: 'enabled'
});

// Configure the pool with proper timeouts and connection limits
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Required for RDS SSL connection
  },
  max: 60, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxUses: 7500, // Close a connection after it has been used 7500 times
  log: () => {} // Disable query logging
});

// Add error handler for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Get a client from the pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Execute a query with retries
export async function query(text: string, params?: any[], maxRetries = 3) {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error as Error;
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error(`Error executing query (attempt ${i + 1}/${maxRetries})`, {
          text,
          error
        });
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}

// Initialize database
export async function initializeDatabase() {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Run migrations
    await runMigrations(client);
    console.log('Database initialized successfully');
    await client.query('COMMIT');
    return client; // Return the client for the caller to manage
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database:', error);
    throw error;
  } finally {
    client.release();
  }
}

export { pool }; 