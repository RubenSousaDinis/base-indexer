import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  try {
    // Read and execute the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Initializing database schema...');
    await pool.query(schema);
    console.log('Schema initialized successfully');
  } catch (error) {
    console.error('Error initializing schema:', error);
    throw error;
  } finally {
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