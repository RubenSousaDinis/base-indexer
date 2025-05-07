import { Migration, MigrationContext } from './types.js';

export const migration: Migration = {
  name: '000_initial_schema',
  async up(context: MigrationContext) {
    const { client } = context;
    try {
      await client.query('BEGIN');

      // Create blocks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS blocks (
          number BIGINT PRIMARY KEY,
          hash VARCHAR(66) NOT NULL UNIQUE,
          parent_hash VARCHAR(66) NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create contracts table for deployed contracts
      await client.query(`
        CREATE TABLE IF NOT EXISTS contracts (
          address VARCHAR(42) PRIMARY KEY,
          block_number BIGINT REFERENCES blocks(number),
          transaction_hash VARCHAR(66),
          deployer_address VARCHAR(42),
          deployment_timestamp TIMESTAMP,
          first_seen_at TIMESTAMP NOT NULL,
          is_pending BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create contract interactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS contract_interactions (
          id SERIAL PRIMARY KEY,
          contract_address VARCHAR(42) NOT NULL REFERENCES contracts(address),
          block_number BIGINT NOT NULL REFERENCES blocks(number),
          transaction_hash VARCHAR(66) NOT NULL,
          from_address VARCHAR(42) NOT NULL,
          gas_used BIGINT NOT NULL,
          gas_price NUMERIC(78,0) NOT NULL,
          total_fee NUMERIC(78,0) NOT NULL,
          interaction_timestamp TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(transaction_hash)
        )
      `);

      // Create indexes for better query performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_contracts_block_number ON contracts(block_number);
        CREATE INDEX IF NOT EXISTS idx_contracts_deployer ON contracts(deployer_address);
        CREATE INDEX IF NOT EXISTS idx_contracts_pending ON contracts(is_pending);
        CREATE INDEX IF NOT EXISTS idx_contract_interactions_contract ON contract_interactions(contract_address);
        CREATE INDEX IF NOT EXISTS idx_contract_interactions_block ON contract_interactions(block_number);
        CREATE INDEX IF NOT EXISTS idx_contract_interactions_from ON contract_interactions(from_address);
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  },

  async down(context: MigrationContext) {
    const { client } = context;
    try {
      await client.query('BEGIN');

      await client.query('DROP TABLE IF EXISTS contract_interactions');
      await client.query('DROP TABLE IF EXISTS contracts');
      await client.query('DROP TABLE IF EXISTS blocks');

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}; 