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
  connectionTimeoutMillis: 10000, // Increased from 2000 to 10000
  maxUses: 7500, // Close a connection after it has been used 7500 times
  log: (msg) => console.log('DB Query:', msg) // Enable query logging for debugging
});

// Add error handler for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit the process, just log the error
  // process.exit(-1);
});

// Add connection handler
pool.on('connect', () => {
  console.log('New client connected to database');
});

// Add acquire handler
pool.on('acquire', () => {
  console.log('Client acquired from pool');
});

// Add remove handler
pool.on('remove', () => {
  console.log('Client removed from pool');
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
    // Check if migrations table exists
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      );
    `);

    if (!rows[0].exists) {
      await client.query('BEGIN');
      // Run migrations
      await runMigrations(client);
      console.log('Database initialized successfully');
      await client.query('COMMIT');
    } else {
      console.log('Database already initialized, skipping migrations');
    }
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