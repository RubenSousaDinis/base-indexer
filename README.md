# Base Indexer

A robust blockchain indexer for Base network that tracks contract deployments and interactions. Built with TypeScript, Node.js, and PostgreSQL.

## Features

- Real-time block processing
- Parallel historical data syncing with multiple worker threads
- Contract deployment tracking
- Contract interaction monitoring
- Automatic gap detection and filling
- PostgreSQL database for reliable data storage

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 12 or higher
- Access to a Base RPC endpoint

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/base-indexer.git
cd base-indexer
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
BASE_RPC_URL=your_base_rpc_url
START_BLOCK=0
BATCH_SIZE=100
NUM_WORKERS=4
```

4. Set up the database:
```bash
npm run setup
```

## Configuration

The following environment variables can be configured:

- `BASE_RPC_URL`: Your Base network RPC endpoint
- `START_BLOCK`: The block number to start indexing from (default: 0)
- `BATCH_SIZE`: Number of blocks to process in each batch (default: 100)
- `NUM_WORKERS`: Number of worker threads for historical sync (default: 4)

## Usage

Start the indexer:
```bash
npm start
```

For development with hot reloading:
```bash
npm run dev
```

## Architecture

The indexer uses a multi-threaded architecture:

1. **Main Thread**
   - Manages real-time block processing
   - Coordinates worker threads
   - Handles graceful shutdown

2. **Worker Threads**
   - Process historical blocks in parallel
   - Each worker handles a specific block range
   - Reports progress back to main thread

## Database Schema

The indexer uses the following tables:

- `blocks`: Stores block information
- `contracts`: Tracks deployed contracts
- `contract_interactions`: Records contract interactions

## Performance

The indexer is optimized for performance through:

- Parallel processing of historical blocks
- Batch processing of transactions
- Efficient database queries
- Automatic gap detection and filling

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
