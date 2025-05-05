-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
    number BIGINT PRIMARY KEY,
    hash TEXT NOT NULL,
    parent_hash TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create contracts table
CREATE TABLE IF NOT EXISTS contracts (
    address TEXT PRIMARY KEY,
    deployer TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (block_number) REFERENCES blocks(number)
);

-- Create contract_interactions table
CREATE TABLE IF NOT EXISTS contract_interactions (
    id SERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL,
    caller TEXT NOT NULL,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    method_signature TEXT,
    input_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES contracts(address),
    FOREIGN KEY (block_number) REFERENCES blocks(number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);
CREATE INDEX IF NOT EXISTS idx_contracts_deployer ON contracts(deployer);
CREATE INDEX IF NOT EXISTS idx_contract_interactions_contract ON contract_interactions(contract_address);
CREATE INDEX IF NOT EXISTS idx_contract_interactions_caller ON contract_interactions(caller); 