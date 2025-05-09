import { schema } from '../schema.js';
import { PoolClient } from 'pg';

export async function up(client: PoolClient) {
  // Create tables and indexes
  await client.query(schema.blocks);
  await client.query(schema.contracts);
  await client.query(schema.contractInteractions);
}

export async function down(client: PoolClient) {
  // Drop tables in reverse order
  await client.query('DROP TABLE IF EXISTS contract_interactions CASCADE');
  await client.query('DROP TABLE IF EXISTS contracts CASCADE');
  await client.query('DROP TABLE IF EXISTS blocks CASCADE');
} 