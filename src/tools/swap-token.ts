import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const swapToken: ToolHandler = {
  name: 'swap_token',
  description: 'Swap tokens using MoonGate DEX integration (Pump.fun)',
  inputSchema: {
    type: 'object',
    properties: {
      inputToken: {
        type: 'object',
        description: 'Input token details',
        properties: {
          mint: { type: 'string', description: 'Solana mint address' },
          decimals: { type: 'number', description: 'Token decimals' },
          symbol: { type: 'string', description: 'Token symbol' },
        },
        required: ['mint', 'decimals', 'symbol'],
      },
      outputToken: {
        type: 'object',
        description: 'Output token details',
        properties: {
          mint: { type: 'string', description: 'Solana mint address' },
          decimals: { type: 'number', description: 'Token decimals' },
          symbol: { type: 'string', description: 'Token symbol' },
        },
        required: ['mint', 'decimals', 'symbol'],
      },
      inputAmount: {
        type: 'number',
        description: "Amount of input token to swap (in token's smallest unit)",
      },
      slippagePercentage: {
        type: 'number',
        description: 'Slippage tolerance as percentage (e.g., 1 = 1%)',
        default: 1,
      },
      password: {
        type: 'string',
        description: 'Wallet password (empty string for OAuth users)',
        default: '',
      },
    },
    required: ['inputToken', 'outputToken', 'inputAmount'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const session = context.sessionManager.getSession();
      const client = createAuthenticatedClient(token);

      const payload = {
        inputToken: args.inputToken,
        outputToken: args.outputToken,
        inputAmount: args.inputAmount,
        slippagePercentage: args.slippagePercentage ?? 1,
        userWallet: session.publicKey,
        password: args.password ?? '',
      };

      const response = await client.post('/pump/swap', payload);
      
      logger.debug('Swap response:', response.data);
      
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      const msg = typeof data === 'object'
        ? (data?.error || data?.message || JSON.stringify(data))
        : (data || error.message);
      logger.error('Failed to swap token:', { status, data });
      throw new Error(`Failed to swap token: ${msg}`);
    }
  },
};
