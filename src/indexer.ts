import { ethers } from 'ethers';
import { query, getClient } from './db/index.js';
import dotenv from 'dotenv';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { Contract } from './types.js';
import pLimit from 'p-limit';

dotenv.config();

interface Transaction extends ethers.TransactionResponse {
  to: string | null;
  from: string;
  hash: string;
  data: string;
}

interface BlockGap {
  start: number;
  end: number;
}

interface ContractCreation {
  address: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  blockTimestamp: Date;
}

// Rate limit to 200 requests per second
const rpcLimit = pLimit(20);

async function processBlock(block: ethers.Block, provider: ethers.JsonRpcProvider) {
  const client = await getClient();
  try {
    // Insert block
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO blocks (number, hash, parent_hash, timestamp) VALUES ($1, $2, $3, to_timestamp($4)) ON CONFLICT (number) DO NOTHING',
      [block.number, block.hash, block.parentHash, block.timestamp]
    );
    await client.query('COMMIT');

    // Get all transactions in this block with rate limiting
    const receipts = await Promise.all(
      block.transactions.map(tx => 
        rpcLimit(() => provider.getTransactionReceipt(tx).catch(error => {
          console.error(`Failed to fetch receipt for tx ${tx}:`, error);
          return null;
        }))
      )
    );

    // Process contract deployments and interactions
    for (const receipt of receipts) {
      if (!receipt) continue;

      try {
        await client.query('BEGIN');

        // Handle contract deployments
        if (receipt.contractAddress) {
          // Update or insert contract with deployment info
          await client.query(`
            INSERT INTO contracts (
              address, block_number, transaction_hash, deployer_address, 
              deployment_timestamp, first_seen_at, is_pending
            ) 
            VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6), false)
            ON CONFLICT (address) 
            DO UPDATE SET
              block_number = EXCLUDED.block_number,
              transaction_hash = EXCLUDED.transaction_hash,
              deployer_address = EXCLUDED.deployer_address,
              deployment_timestamp = EXCLUDED.deployment_timestamp,
              is_pending = false
          `, [
            receipt.contractAddress,
            block.number,
            receipt.hash,
            receipt.from,
            block.timestamp,
            block.timestamp
          ]);
        }

        // Handle contract interactions
        if (receipt.to) {
          // First check if this address exists in our contracts table
          const contractResult = await client.query(
            'SELECT address FROM contracts WHERE address = $1',
            [receipt.to]
          );

          // If contract doesn't exist, create it as pending
          if (contractResult.rows.length === 0) {
            await client.query(`
              INSERT INTO contracts (
                address, first_seen_at, is_pending
              ) VALUES ($1, to_timestamp($2), true)
              ON CONFLICT (address) DO NOTHING
            `, [
              receipt.to,
              block.timestamp
            ]);
          }

          // Now we can safely insert the interaction
          const totalFee = receipt.gasUsed * receipt.gasPrice;
          await client.query(
            'INSERT INTO contract_interactions (contract_address, block_number, transaction_hash, from_address, gas_used, gas_price, total_fee, interaction_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8)) ON CONFLICT (transaction_hash) DO NOTHING',
            [
              receipt.to,
              block.number,
              receipt.hash,
              receipt.from,
              receipt.gasUsed,
              receipt.gasPrice,
              totalFee,
              block.timestamp
            ]
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error processing transaction ${receipt.hash}:`, error);
        // Continue with next transaction even if this one fails
      }
    }
  } catch (error) {
    console.error(`Error processing block ${block.number}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

export class BaseIndexer {
  private provider: ethers.JsonRpcProvider;
  private currentBlock: number;
  private batchSize: number;
  private isRunning: boolean = false;
  private historicalWorkers: Worker[] = [];
  private numWorkers: number;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.currentBlock = parseInt(process.env.START_BLOCK || '0');
    this.batchSize = parseInt(process.env.BATCH_SIZE || '100');
    this.numWorkers = parseInt(process.env.NUM_WORKERS || '4');
  }

  private async findBlockGaps(): Promise<BlockGap[]> {
    try {
      // Get all block numbers in order
      const result = await query(
        'SELECT number FROM blocks ORDER BY number ASC'
      );
      
      const blocks = result.rows.map(row => row.number);
      const gaps: BlockGap[] = [];
      
      // If no blocks exist, return a gap from genesis
      if (blocks.length === 0) {
        return [{ start: 0, end: -1 }]; // -1 indicates "up to latest"
      }

      // Check for gap at the beginning
      if (blocks[0] > 0) {
        gaps.push({ start: 0, end: blocks[0] - 1 });
      }

      // Check for gaps between blocks
      for (let i = 0; i < blocks.length - 1; i++) {
        if (blocks[i + 1] - blocks[i] > 1) {
          gaps.push({
            start: blocks[i] + 1,
            end: blocks[i + 1] - 1
          });
        }
      }

      return gaps;
    } catch (error) {
      console.error('Error finding block gaps:', error);
      return [{ start: 0, end: -1 }]; // Return full range on error
    }
  }

  private async getLatestProcessedBlock(): Promise<number> {
    try {
      // Find any gaps in the block sequence
      const gaps = await this.findBlockGaps();
      
      if (gaps.length > 0) {
        // If there are gaps, start from the earliest gap
        const earliestGap = gaps[0];
        console.log(`Found block gaps. Starting from block ${earliestGap.start}`);
        return earliestGap.start - 1; // Return the block before the gap
      }

      // If no gaps, get the latest block
      const result = await query(
        'SELECT COALESCE(MAX(number), -1) as latest_block FROM blocks'
      );
      return result.rows[0].latest_block;
    } catch (error) {
      console.error('Error getting latest processed block:', error);
      return -1;
    }
  }

  async start() {
    this.isRunning = true;
    console.log('Starting Base indexer...');
    
    // Get the latest processed block from the database
    const latestProcessedBlock = await this.getLatestProcessedBlock();
    this.currentBlock = latestProcessedBlock + 1;
    console.log(`Starting from block ${this.currentBlock}`);
    
    // Start historical sync in a separate worker
    this.startHistoricalSync();
    
    // Start real-time sync in the main thread
    this.syncNewBlocks();
  }

  private startHistoricalSync() {
    if (isMainThread) {
      const workerPath = fileURLToPath(import.meta.url);
      
      // Get the latest block number
      this.provider.getBlockNumber().then(async (latestBlock) => {
        console.log(`Starting historical sync from block ${this.currentBlock} to ${latestBlock}`);
        
        // Calculate block ranges for each worker
        const totalBlocks = latestBlock - this.currentBlock;
        const blocksPerWorker = Math.ceil(totalBlocks / this.numWorkers);
        
        // Create and start workers
        for (let i = 0; i < this.numWorkers; i++) {
          const startBlock = this.currentBlock + (i * blocksPerWorker);
          const endBlock = Math.min(startBlock + blocksPerWorker - 1, latestBlock);
          
          if (startBlock > endBlock) continue; // Skip if no blocks to process
          
          console.log(`Starting worker ${i + 1} for blocks ${startBlock} to ${endBlock}`);
          
          const worker = new Worker(workerPath, {
            workerData: {
              startBlock,
              endBlock,
              batchSize: this.batchSize,
              rpcUrl: process.env.BASE_RPC_URL,
              workerId: i + 1
            }
          });

          worker.on('message', (message) => {
            if (message.type === 'progress') {
              console.log(`Worker ${message.workerId} progress: ${message.currentBlock}/${message.endBlock}`);
            } else if (message.type === 'complete') {
              console.log(`Worker ${message.workerId} completed blocks ${message.startBlock} to ${message.endBlock}`);
              this.historicalWorkers = this.historicalWorkers.filter(w => w !== worker);
              worker.terminate();
              
              // If all workers are done, we're finished
              if (this.historicalWorkers.length === 0) {
                console.log('Historical sync completed');
              }
            }
          });

          worker.on('error', (error) => {
            console.error(`Worker ${i + 1} error:`, error);
            this.historicalWorkers = this.historicalWorkers.filter(w => w !== worker);
            worker.terminate();
          });

          this.historicalWorkers.push(worker);
        }
      });
    }
  }

  private async syncNewBlocks() {
    this.provider.on('block', async (blockNumber: number) => {
      // Only process the new block
      const block = await this.provider.getBlock(blockNumber, true);
      console.log(`Processing new block ${blockNumber}`);
      if (!block){ 
        console.log(`Block ${blockNumber} not found`);
        return;
      }

      await processBlock(block, this.provider);
      console.log(`Processed new block ${blockNumber}`);
    });
  }

  stop() {
    this.isRunning = false;
    this.provider.removeAllListeners();
    this.historicalWorkers.forEach(worker => {
      worker.terminate();
    });
    this.historicalWorkers = [];
  }
}

// Worker thread code
if (!isMainThread && workerData) {
  const { startBlock, endBlock, batchSize, rpcUrl, workerId } = workerData;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  let currentBlock = startBlock;

  async function syncHistoricalBlocks() {
    try {
      while (currentBlock <= endBlock) {
        const batchEndBlock = Math.min(currentBlock + batchSize - 1, endBlock);
        
        // Process blocks in batches
        for (let blockNumber = currentBlock; blockNumber <= batchEndBlock; blockNumber++) {
          const block = await provider.getBlock(blockNumber, true);
          if (!block) continue;

          await processBlock(block, provider);
        }

        currentBlock = batchEndBlock + 1;
        
        // Report progress
        parentPort?.postMessage({
          type: 'progress',
          workerId,
          currentBlock,
          endBlock
        });
      }

      // Report completion
      parentPort?.postMessage({
        type: 'complete',
        workerId,
        startBlock,
        endBlock
      });
    } catch (error) {
      console.error(`Worker ${workerId} error:`, error);
      process.exit(1);
    }
  }

  syncHistoricalBlocks();
} 