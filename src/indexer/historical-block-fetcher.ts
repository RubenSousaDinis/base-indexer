import { ethers } from 'ethers';
import { query } from '../db/index.js';
import { newBlockRpcLimit, delay } from './utils.js';

// Historical Block Fetcher - Gets old blocks in batches
export class HistoricalBlockFetcher {
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;
  private batchSize: number = parseInt(process.env.HISTORICAL_BLOCKS_BATCH_SIZE || '5');
  private currentBlock: number = 0;
  private endBlock: number = 0;

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
  }

  async start() {
    try {
      // Get the latest block from the chain
      const latestBlock = await newBlockRpcLimit(() => this.provider.getBlock('latest'));
      if (!latestBlock) {
        console.error('Failed to get latest block from chain');
        return;
      }
      this.endBlock = latestBlock.number;

      // Find the earliest gap in blocks
      const result = await query(`
        WITH block_numbers AS (
          SELECT generate_series(0, $1) as number
        )
        SELECT MIN(bn.number) as gap_start
        FROM block_numbers bn
        LEFT JOIN blocks b ON b.number = bn.number
        WHERE b.number IS NULL
      `, [this.endBlock]);

      this.currentBlock = result.rows[0].gap_start || 0;
      
      console.log(`Starting Historical Block Fetcher from block ${this.currentBlock} to ${this.endBlock}`);
      this.isRunning = true;

      while (this.isRunning && this.currentBlock <= this.endBlock) {
        try {
          const batchEndBlock = Math.min(this.currentBlock + this.batchSize - 1, this.endBlock);
          console.log(`Fetching blocks ${this.currentBlock} to ${batchEndBlock}`);

          // Fetch blocks in parallel with a smaller concurrency
          const blockPromises = [];
          for (let blockNumber = this.currentBlock; blockNumber <= batchEndBlock; blockNumber++) {
            blockPromises.push(this.fetchBlock(blockNumber));
          }
          await Promise.all(blockPromises);

          this.currentBlock = batchEndBlock + 1;
          console.log(`Completed batch. Next block: ${this.currentBlock}`);
          
          // Add delay between batches
          await delay(100);
        } catch (error) {
          console.error('Error fetching historical blocks:', error);
          await delay(2000); // Longer delay on error
        }
      }
    } catch (error) {
      console.error('Error starting Historical Block Fetcher:', error);
      // Don't throw the error, just log it
    }
  }

  private async fetchBlock(blockNumber: number) {
    try {
      const blockTag = ethers.toBeHex(blockNumber);
      const block = await newBlockRpcLimit(() => this.provider.getBlock(blockTag, true));
      if (!block) {
        console.log(`Block ${blockNumber} not found`);
        return;
      }

      // Insert block if not exists
      await query(`
        INSERT INTO blocks (number, hash, parent_hash, block_timestamp)
        VALUES ($1, $2, $3, to_timestamp($4))
        ON CONFLICT (number) DO NOTHING
      `, [
        blockNumber,
        block.hash,
        block.parentHash,
        block.timestamp
      ]);
    } catch (error) {
      console.error(`Error fetching block ${blockNumber}:`, error);
    }
  }

  stop() {
    console.log('Stopping Historical Block Fetcher...');
    this.isRunning = false;
  }
} 