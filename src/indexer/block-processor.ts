import { ethers } from 'ethers';
import { query, getClient } from '../db/index.js';
import { historicalRpcLimit, newBlockRpcLimit, delay } from './utils.js';
import pLimit from 'p-limit';

export class BlockProcessor {
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;
  private isHistorical: boolean;
  private client: any = null;
  private rpcLimit: any;
  private readonly BATCH_SIZE = 2;
  private readonly NUM_WORKERS = 50;

  constructor(provider: ethers.JsonRpcProvider, isHistorical: boolean = false) {
    this.provider = provider;
    this.isHistorical = isHistorical;
    this.rpcLimit = isHistorical ? historicalRpcLimit : newBlockRpcLimit;
  }

  private async processTransaction(txHash: string, blockNumber: number, block: any, client: any) {
    try {
      const receipt = await this.rpcLimit(() => this.provider.getTransactionReceipt(txHash));
      if (!receipt) return;

      // Handle contract deployments
      if (receipt.contractAddress) {
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
    } catch (error) {
      console.error(`Error processing transaction ${txHash} in block ${blockNumber}:`, error);
      throw error;
    }
  }

  private async processBlock(blockNumber: number) {
    const blockStartTime = Date.now();
    try {
      // Get a single client for all transactions in this block
      this.client = await getClient();
      await this.client.query('BEGIN');

      const blockTag = ethers.toBeHex(blockNumber);
      const block = await this.rpcLimit(() => this.provider.getBlock(blockTag));
      if (!block) {
        console.error(`Block ${blockNumber} not found`);
        await this.client.query('ROLLBACK');
        return;
      }

      console.log(`[Block ${blockNumber}] Starting processing of ${block.transactions.length} transactions`);

      // Insert or update block with transaction count
      await this.client.query(`
        INSERT INTO blocks (
          number, hash, parent_hash, block_timestamp, transactions_count
        ) VALUES ($1, $2, $3, to_timestamp($4), $5)
        ON CONFLICT (number) DO UPDATE SET
          hash = EXCLUDED.hash,
          parent_hash = EXCLUDED.parent_hash,
          block_timestamp = EXCLUDED.block_timestamp,
          transactions_count = EXCLUDED.transactions_count
      `, [
        block.number,
        block.hash,
        block.parentHash,
        block.timestamp,
        block.transactions.length
      ]);

      if (this.isHistorical) {
        // Process historical blocks sequentially
        for (const txHash of block.transactions) {
          try {
            await this.processTransaction(txHash, blockNumber, block, this.client);
          } catch (error) {
            console.error(`Error processing transaction ${txHash} in block ${blockNumber}:`, error);
            // Rollback and get a new client for the next transaction
            await this.client.query('ROLLBACK');
            this.client.release();
            this.client = await getClient();
            await this.client.query('BEGIN');
          }
        }
      } else {
        // Process new blocks in parallel batches
        const transactions = block.transactions;
        const batches = [];
        
        // Split transactions into batches
        for (let i = 0; i < transactions.length; i += this.BATCH_SIZE) {
          batches.push(transactions.slice(i, i + this.BATCH_SIZE));
        }

        // Create a worker pool
        const workerPool = pLimit(this.NUM_WORKERS);
        let completedBatches = 0;
        let completedTransactions = 0;

        // Process batches in parallel
        const batchPromises = batches.map(async (batch, batchIndex) => {
          // Get a new client for each batch
          const batchClient = await getClient();
          await batchClient.query('BEGIN');

          try {
            // Process all transactions in the batch first
            const transactionPromises = batch.map((txHash: string) => 
              workerPool(async () => {
                try {
                  await this.processTransaction(txHash, blockNumber, block, batchClient);
                  completedTransactions++;
                } catch (error) {
                  console.error(`[Block ${blockNumber}] Error in transaction ${txHash}:`, error);
                  throw error;
                }
              })
            );

            // Wait for all transactions in the batch to complete
            await Promise.all(transactionPromises);

            // Only commit after all transactions in the batch are processed
            await batchClient.query('COMMIT');
            completedBatches++;
          } catch (error) {
            console.error(`[Block ${blockNumber}] Error processing batch ${batchIndex + 1}/${batches.length}:`, error);
            await batchClient.query('ROLLBACK');
          } finally {
            batchClient.release();
          }
        });

        await Promise.all(batchPromises);
      }

      // Mark block as processed
      await this.client.query(
        'UPDATE blocks SET processed_at = NOW() WHERE number = $1',
        [blockNumber]
      );

      await this.client.query('COMMIT');
      const totalBlockTime = Date.now() - blockStartTime;
      if (!this.isHistorical) {
        console.log(`[Block ${blockNumber}] Completed processing ${block.transactions.length} transactions in ${totalBlockTime}ms`);
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
      if (this.client) {
        await this.client.query('ROLLBACK');
      }
    } finally {
      if (this.client) {
        this.client.release();
        this.client = null;
      }
    }
  }

  private async processNextBlock() {
    try {
      // Get the next unprocessed block
      const result = await query(
        `SELECT number 
         FROM blocks 
         WHERE processed_at IS NULL 
         ORDER BY number ${this.isHistorical ? 'ASC' : 'DESC'} 
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        if (!this.isHistorical) {
          console.log('New block processor: No blocks to process');
        }
        return;
      }

      const blockNumber = result.rows[0].number;
      await this.processBlock(blockNumber);
    } catch (error) {
      console.error('Error in processNextBlock:', error);
      // Add a small delay before retrying
      await delay(1000);
    }
  }

  private async processLoop() {
    while (this.isRunning) {
      await this.processNextBlock();
      // Add a small delay between blocks to prevent overwhelming the database
      await delay(100);
    }
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    if (!this.isHistorical) {
      console.log('Starting New Block Processor');
    }
    this.processLoop();
  }

  public async stop() {
    this.isRunning = false;
    if (this.client) {
      await this.client.release();
      this.client = null;
    }
    console.log(`Stopping ${this.isHistorical ? 'Historical' : 'New'} Block Processor`);
  }
} 