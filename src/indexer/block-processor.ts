import { ethers } from 'ethers';
import { query, getClient } from '../db/index.js';
import { newBlockRpcLimit, delay } from './utils.js';

interface ContractDeployment {
  address: string;
  block_number: number;
  transaction_hash: string;
  deployer_address: string;
  deployment_timestamp: number;
  first_seen_at: number;
}

interface ContractInteraction {
  contract_address: string;
  block_number: number;
  transaction_hash: string;
  from_address: string;
  gas_used: string;
  gas_price: string;
  total_fee: string;
  interaction_timestamp: number;
}

export class BlockProcessor {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly isHistorical: boolean;
  private isRunning: boolean = false;
  private client: any = null;
  private rpcLimit: any;

  constructor(provider: ethers.JsonRpcProvider, isHistorical: boolean = false) {
    this.provider = provider;
    this.isHistorical = isHistorical;
    this.rpcLimit = isHistorical ? newBlockRpcLimit : newBlockRpcLimit;
  }

  private processReceipt(receipt: any, blockNumber: number): { deployments: ContractDeployment[], interactions: ContractInteraction[] } {
    const deployments: ContractDeployment[] = [];
    const interactions: ContractInteraction[] = [];

    // Handle contract deployments
    if (receipt.contractAddress) {
      deployments.push({
        address: receipt.contractAddress,
        block_number: blockNumber,
        transaction_hash: receipt.transactionHash,
        deployer_address: receipt.from,
        deployment_timestamp: Math.floor(Date.now() / 1000), // Use current timestamp as fallback
        first_seen_at: Math.floor(Date.now() / 1000)
      });
    }

    // Handle contract interactions
    if (receipt.to) {
      const gasUsed = receipt.gasUsed || '0';
      const gasPrice = receipt.gasPrice || '0';
      const totalFee = BigInt(gasUsed) * BigInt(gasPrice);
      interactions.push({
        contract_address: receipt.to,
        block_number: blockNumber,
        transaction_hash: receipt.transactionHash,
        from_address: receipt.from,
        gas_used: gasUsed,
        gas_price: gasPrice,
        total_fee: totalFee.toString(),
        interaction_timestamp: Math.floor(Date.now() / 1000) // Use current timestamp as fallback
      });
    }

    return { deployments, interactions };
  }

  private async getTransactionReceipts(blockNumber: number): Promise<any[]> {
    console.log(`[Block ${blockNumber}] Fetching receipts for block`);
    try {
      const blockTag = ethers.toBeHex(blockNumber);
      const receipts = await this.rpcLimit(() => this.provider.send('eth_getBlockReceipts', [blockTag]));
      console.log(`[Block ${blockNumber}] Received ${receipts.length} receipts`);
      return receipts;
    } catch (error) {
      console.error(`Error fetching receipts for block ${blockNumber}:`, error);
      return [];
    }
  }

  private async processBlock(blockNumber: number) {
    const blockStartTime = Date.now();
    try {
      console.log(`[Block ${blockNumber}] Starting processing`);

      // Get all transaction receipts
      const receipts = await this.getTransactionReceipts(blockNumber);
      if (!receipts || receipts.length === 0) {
        console.error(`No receipts found for block ${blockNumber}`);
        return;
      }

      // Process all receipts in memory
      const allDeployments: ContractDeployment[] = [];
      const allInteractions: ContractInteraction[] = [];

      for (const receipt of receipts) {
        const { deployments, interactions } = this.processReceipt(receipt, blockNumber);
        allDeployments.push(...deployments);
        allInteractions.push(...interactions);
      }

      // Get a client and start transaction
      this.client = await getClient();
      await this.client.query('BEGIN');

      try {
        // Insert all contract deployments
        if (allDeployments.length > 0) {
          const deploymentValues = allDeployments.map(d => `(
            '${d.address}',
            ${d.block_number},
            '${d.transaction_hash}',
            '${d.deployer_address}',
            to_timestamp(${d.deployment_timestamp}),
            to_timestamp(${d.first_seen_at}),
            false
          )`).join(',');

          await this.client.query(`
            INSERT INTO contracts (
              address, block_number, transaction_hash, deployer_address,
              deployment_timestamp, first_seen_at, is_pending
            ) VALUES ${deploymentValues}
            ON CONFLICT (address) DO UPDATE SET
              block_number = EXCLUDED.block_number,
              transaction_hash = EXCLUDED.transaction_hash,
              deployer_address = EXCLUDED.deployer_address,
              deployment_timestamp = EXCLUDED.deployment_timestamp,
              is_pending = false
          `);
        }

        // Insert all contract interactions
        if (allInteractions.length > 0) {
          const interactionValues = allInteractions.map(i => `(
            '${i.contract_address}',
            ${i.block_number},
            '${i.transaction_hash}',
            '${i.from_address}',
            '${i.gas_used}',
            '${i.gas_price}',
            '${i.total_fee}',
            to_timestamp(${i.interaction_timestamp})
          )`).join(',');

          await this.client.query(`
            INSERT INTO contract_interactions (
              contract_address, block_number, transaction_hash, from_address,
              gas_used, gas_price, total_fee, interaction_timestamp
            ) VALUES ${interactionValues}
            ON CONFLICT (transaction_hash) DO NOTHING
          `);
        }

        // Mark block as processed
        await this.client.query(
          'UPDATE blocks SET processed_at = NOW() WHERE number = $1',
          [blockNumber]
        );

        await this.client.query('COMMIT');
        const totalBlockTime = Date.now() - blockStartTime;
        if (!this.isHistorical) {
          console.log(`[Block ${blockNumber}] Completed processing ${receipts.length} transactions in ${totalBlockTime}ms`);
        }
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
        await this.client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    } finally {
      if (this.client) {
        this.client.release();
        this.client = null;
      }
    }
  }

  public async processNextBlock() {
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

      // Skip block 0 as it's a special block in Base
      if (blockNumber === '0') {
        console.log('Skipping block 0 as it is a special block in Base');
        this.client = await getClient();
        await this.client.query('BEGIN');
        try {
          await this.client.query(
            'UPDATE blocks SET processed_at = NOW() WHERE number = $1',
            [blockNumber]
          );
          await this.client.query('COMMIT');
        } catch (error) {
          console.error('Error marking block 0 as processed:', error);
          await this.client.query('ROLLBACK');
        } finally {
          this.client.release();
          this.client = null;
        }
        return;
      }

      await this.processBlock(blockNumber);
    } catch (error) {
      console.error('Error in processNextBlock:', error);
      // Add a small delay before retrying
      await delay(1000);
    }
  }

  private async processLoop() {
    console.log(`Starting ${this.isHistorical ? 'Historical' : 'New'} Block Processor loop`);
    while (this.isRunning) {
      await this.processNextBlock();
      await delay(100);
    }
    console.log(`Stopping ${this.isHistorical ? 'Historical' : 'New'} Block Processor loop`);
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