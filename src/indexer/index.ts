import { ethers } from 'ethers';
import { BlockListener } from './block-listener.js';
import { HistoricalBlockFetcher } from './historical-block-fetcher.js';
import { BlockProcessor } from './block-processor.js';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

async function main() {
  // Create providers
  const blockFetcherProvider = new ethers.JsonRpcProvider(process.env.BLOCKS_FETCHER_RPC);
  const blockProcessorProvider = new ethers.JsonRpcProvider(process.env.BLOCKS_PROCESSOR_RPC);

  // Create instances of our workers
  const blockListener = new BlockListener(blockFetcherProvider);
  const historicalBlockFetcher = new HistoricalBlockFetcher(blockFetcherProvider);
  const historicalBlockProcessor = new BlockProcessor(blockProcessorProvider, true);
  const newBlockProcessor = new BlockProcessor(blockProcessorProvider, false);

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
  // Don't exit the process, just log the error
}); 