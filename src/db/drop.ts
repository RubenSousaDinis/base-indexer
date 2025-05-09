import { getClient } from '../db/index.js';

async function dropDatabase() {
  const client = await getClient();
  try {
    console.log('Starting database drop...');
    
    // Start transaction
    await client.query('BEGIN');

    // Drop all tables
    await client.query(`
      DROP TABLE IF EXISTS blocks CASCADE;
      DROP TABLE IF EXISTS contracts CASCADE;
      DROP TABLE IF EXISTS contract_interactions CASCADE;
      DROP TABLE IF EXISTS migrations CASCADE;
    `);

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Database tables dropped successfully');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Error dropping database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the drop
dropDatabase()
  .then(() => {
    console.log('Database drop completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to drop database:', error);
    process.exit(1);
  }); 