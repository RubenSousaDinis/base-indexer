import { ethers } from 'ethers';
import { query } from '../db/index.js';
import { delay } from './utils.js';

// Block Listener - Adds new blocks to database
export class BlockListener {
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_INFURA_RPC);
  }

  async start() {
    console.log('Starting Block Listener...');
    this.isRunning = true;
    
    this.provider.on('block', async (blockNumber: number) => {
      if (!this.isRunning) return;

      try {
        const blockTag = ethers.toBeHex(blockNumber);
        const block = await this.provider.getBlock(blockTag, true);
        if (!block) {
          console.error(`Block ${blockNumber} not found`);
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

        console.log(`Added new block ${blockNumber} to database`);
      } catch (error) {
        console.error(`Error adding block ${blockNumber} to database:`, error);
      }
    });
  }

  stop() {
    console.log('Stopping Block Listener...');
    this.isRunning = false;
    this.provider.removeAllListeners();
  }
} 