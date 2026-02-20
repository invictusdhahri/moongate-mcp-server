import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const sendToken: ToolHandler = {
  name: 'send_token',
  description: 'Send SPL tokens or SOL to another wallet address',
  inputSchema: {
    type: 'object',
    properties: {
      tokenMint: {
        type: 'string',
        description: 'Token mint address (use SOL native mint for SOL transfers)',
      },
      toAddress: {
        type: 'string',
        description: 'Recipient wallet address',
      },
      amount: {
        type: 'number',
        description: 'Amount to send (in token units, not lamports)',
      },
      decimals: {
        type: 'number',
        description: 'Token decimals (9 for SOL)',
        default: 9,
      },
      userWallet: {
        type: 'string',
        description: 'Sender wallet address (will be auto-filled if not provided)',
      },
    },
    required: ['tokenMint', 'toAddress', 'amount'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      // Get user wallet if not provided
      let userWallet = args.userWallet;
      if (!userWallet) {
        const walletResponse = await client.get('/api2/getwalletaddress');
        userWallet = walletResponse.data.publicKey;
      }
      
      const response = await client.post('/sending/sendtoken', {
        tokenMint: args.tokenMint,
        toAddress: args.toAddress,
        amount: args.amount,
        decimals: args.decimals || 9,
        userWallet,
        password: '', // Empty password per spec
      });
      
      logger.debug('Send token response:', response.data);
      
      return {
        success: response.data.success !== false,
        signature: response.data.signature,
        error: response.data.error,
      };
    } catch (error: any) {
      logger.error('Failed to send token:', error.response?.data || error.message);
      throw new Error(`Failed to send token: ${error.response?.data?.error || error.message}`);
    }
  },
};
