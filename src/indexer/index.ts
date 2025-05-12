import { ethers } from 'ethers';
import { BlockListener } from './block-listener.js';
import { HistoricalBlockFetcher } from './historical-block-fetcher.js';
import { BlockProcessor } from './block-processor.js';

async function main() {
  // Create providers
  const historicalProvider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const newBlockProvider = new ethers.JsonRpcProvider(process.env.BASE_INFURA_RPC);

  // Create instances of our workers
  const blockListener = new BlockListener();
  const historicalBlockFetcher = new HistoricalBlockFetcher();
  const historicalBlockProcessor = new BlockProcessor(newBlockProvider, true);
  const newBlockProcessor = new BlockProcessor(newBlockProvider, false);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    blockListener.stop();
    historicalBlockFetcher.stop();
    historicalBlockProcessor.stop();
    newBlockProcessor.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start all workers immediately
  console.log('Starting all workers...');
  await Promise.all([
    blockListener.start(),
    historicalBlockFetcher.start(),
    historicalBlockProcessor.start(),
    newBlockProcessor.start()
  ]);
}

// Start the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 