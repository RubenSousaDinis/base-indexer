import { Pool } from 'pg';

export const schema = {
  blocks: `
    CREATE TABLE IF NOT EXISTS blocks (
      number BIGINT PRIMARY KEY,
      hash TEXT NOT NULL,
      parent_hash TEXT NOT NULL,
      block_timestamp TIMESTAMP NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      transactions_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_block_timestamp ON blocks(block_timestamp);
    CREATE INDEX IF NOT EXISTS idx_blocks_processed_at ON blocks(processed_at);
  `,
  contracts: `
    CREATE TABLE IF NOT EXISTS contracts (
      address TEXT PRIMARY KEY,
      block_number BIGINT,
      transaction_hash TEXT,
      deployer_address TEXT,
      deployment_timestamp TIMESTAMP,
      first_seen_at TIMESTAMP NOT NULL,
      is_pending BOOLEAN NOT NULL DEFAULT true,
      FOREIGN KEY (block_number) REFERENCES blocks(number)
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_deployer ON contracts(deployer_address);
    CREATE INDEX IF NOT EXISTS idx_contracts_deployment_timestamp ON contracts(deployment_timestamp);
  `,
  contractInteractions: `
    CREATE TABLE IF NOT EXISTS contract_interactions (
      id SERIAL PRIMARY KEY,
      contract_address TEXT NOT NULL,
      block_number BIGINT NOT NULL,
      transaction_hash TEXT UNIQUE NOT NULL,
      from_address TEXT NOT NULL,
      gas_used BIGINT NOT NULL,
      gas_price BIGINT NOT NULL,
      total_fee BIGINT NOT NULL,
      interaction_timestamp TIMESTAMP NOT NULL,
      FOREIGN KEY (block_number) REFERENCES blocks(number)
    );
    CREATE INDEX IF NOT EXISTS idx_contract_interactions_contract ON contract_interactions(contract_address);
    CREATE INDEX IF NOT EXISTS idx_contract_interactions_from ON contract_interactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_contract_interactions_timestamp ON contract_interactions(interaction_timestamp);
  `
};

export async function initializeDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const client = await pool.connect();
  try {
    // Create tables
    await client.query(schema.blocks);
    await client.query(schema.contracts);
    await client.query(schema.contractInteractions);
    
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
} 