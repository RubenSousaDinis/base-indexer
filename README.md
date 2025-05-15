# Base Indexer

A high-performance indexer for the Base blockchain that tracks contract deployments and interactions with them.

## Features

- Tracks contract deployments and interactions
- Processes blocks in parallel batches
- Handles both historical and new blocks
- Uses connection pooling for efficient database access
- Implements rate limiting for RPC calls

## Database Schema

### Blocks
```sql
CREATE TABLE blocks (
  number BIGINT PRIMARY KEY,
  hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  block_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  transactions_count INTEGER NOT NULL DEFAULT 0
);
```

### Contracts
```sql
CREATE TABLE contracts (
  address TEXT PRIMARY KEY,
  block_number BIGINT,
  transaction_hash TEXT,
  deployer_address TEXT,
  deployment_timestamp TIMESTAMP,
  first_seen_at TIMESTAMP NOT NULL,
  is_pending BOOLEAN NOT NULL DEFAULT true,
  FOREIGN KEY (block_number) REFERENCES blocks(number)
);
```

### Contract Interactions
```sql
CREATE TABLE contract_interactions (
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
```

## Configuration

### Environment Variables
```env
# Base RPC URLs
BLOCKS_FETCHER_RPC=https://base-mainnet.infura.io/v3/...  # For fetching blocks (both historical and new)
BLOCKS_PROCESSOR_RPC=https://base-mainnet.infura.io/v3/...  # For processing blocks

# PostgreSQL Configuration
POSTGRES_HOST=your-rds-endpoint
POSTGRES_PORT=5432
POSTGRES_DB=base_indexer
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password

# Indexer Configuration
START_BLOCK=0
HISTORICAL_BLOCKS_BATCH_SIZE=5  # Number of blocks to fetch in each historical batch
```

### Database Connection Pool
- Maximum connections: 60
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds
- Max uses per connection: 7500

### Block Processing
- Batch size: 2 transactions per batch
- Number of workers: 50 concurrent workers
- Parallel processing for new blocks
- Sequential processing for historical blocks

### Performance Metrics
- Processing rate: ~1.23 blocks per second
- Average processing time: ~810ms per block
- Tests done with 50-350 transactions per block
- Consistent performance across varying transaction counts
- Database operations optimized for bulk inserts
- Efficient handling of contract deployments and interactions

## Performance Considerations

- Uses connection pooling to manage database connections efficiently
- Implements rate limiting for RPC calls to prevent overloading
- Processes transactions in parallel batches for new blocks
- Maintains sequential processing for historical blocks to ensure data consistency
- Records contract interactions even if the contract is not yet in our database

## Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run the indexer:
```bash
npm start
```

## Deployment

The indexer is deployed on AWS ECS with the following components:
- ECS Fargate for containerized deployment
- RDS PostgreSQL for data storage
- ECR for container registry

To deploy:
```bash
cd terraform
./deploy.sh
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

