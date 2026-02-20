import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const swapToken: ToolHandler = {
  name: 'swap_token',
  description: 'Swap tokens using MoonGate DEX integration',
  inputSchema: {
    type: 'object',
    properties: {
      inputMint: {
        type: 'string',
        description: 'Input token mint address',
      },
      outputMint: {
        type: 'string',
        description: 'Output token mint address',
      },
      amount: {
        type: 'number',
        description: 'Amount of input token to swap',
      },
      slippage: {
        type: 'number',
        description: 'Slippage tolerance in basis points (e.g., 100 = 1%)',
        default: 100,
      },
    },
    required: ['inputMint', 'outputMint', 'amount'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      const response = await client.post('/pump/swap', {
        inputMint: args.inputMint,
        outputMint: args.outputMint,
        amount: args.amount,
        slippage: args.slippage || 100,
      });
      
      logger.debug('Swap response:', response.data);
      
      return response.data;
    } catch (error: any) {
      logger.error('Failed to swap token:', error.response?.data || error.message);
      throw new Error(`Failed to swap token: ${error.response?.data?.error || error.message}`);
    }
  },
};
