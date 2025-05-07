import { BaseIndexer } from './indexer.js';
import { initializeDatabase } from './db/index.js';
import { schema } from './db/schema.js';
import { PoolClient } from 'pg';

async function main() {
  let client: PoolClient | null = null;
  try {
    // Initialize database
    client = await initializeDatabase();
    console.log('Database initialized successfully');

    // Create and start the indexer
    const indexer = new BaseIndexer();
    await indexer.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down indexer...');
      if (client) {
        client.release();
      }
      indexer.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error starting indexer:', error);
    if (client) {
      client.release();
    }
    process.exit(1);
  }
}

main(); 