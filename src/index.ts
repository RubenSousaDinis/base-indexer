import { BaseIndexer } from './indexer.js';
import { query } from './db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    // Read and execute the schema file
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await query(schema);
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    // Initialize database
    await initializeDatabase();

    // Create and start the indexer
    const indexer = new BaseIndexer();
    await indexer.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down indexer...');
      indexer.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error starting indexer:', error);
    process.exit(1);
  }
}

main(); 