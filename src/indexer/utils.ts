import pLimit from 'p-limit';
import { ethers } from 'ethers';

// Rate limit for new blocks (100 requests per second)
export const newBlockRpcLimit = pLimit(500);

// Add delay between requests
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
