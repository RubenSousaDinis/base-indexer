import { query } from './index.js';
import dotenv from 'dotenv';

dotenv.config();

async function dropDatabase() {
  try {
    console.log('Dropping database tables...');

    // Drop tables in correct order due to foreign key constraints
    await query('DROP TABLE IF EXISTS contract_interactions CASCADE');
    await query('DROP TABLE IF EXISTS contracts CASCADE');
    await query('DROP TABLE IF EXISTS blocks CASCADE');

    console.log('Database tables dropped successfully');
  } catch (error) {
    console.error('Error dropping database tables:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  dropDatabase();
} 