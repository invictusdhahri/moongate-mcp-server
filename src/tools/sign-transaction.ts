import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const signTransaction: ToolHandler = {
  name: 'sign_transaction',
  description: 'Sign a Solana transaction with the MoonGate wallet. Optionally broadcast it to the network.',
  inputSchema: {
    type: 'object',
    properties: {
      serializedTransaction: {
        type: 'array',
        items: { type: 'number' },
        description: 'The serialized transaction as an array of bytes',
      },
      type: {
        type: 'string',
        enum: ['legacy', 'versioned'],
        description: 'Transaction type',
        default: 'versioned',
      },
      broadcast: {
        type: 'boolean',
        description: 'Whether to broadcast the transaction after signing',
        default: false,
      },
      includePayerSignature: {
        type: 'boolean',
        description: 'Whether to include the payer signature',
        default: true,
      },
    },
    required: ['serializedTransaction'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      const response = await client.post('/api/wallet/sign-transaction', {
        serializedTransaction: args.serializedTransaction,
        type: args.type || 'versioned',
        password: '', // Empty password per spec
        broadcast: args.broadcast || false,
        includePayerSignature: args.includePayerSignature !== false,
      });
      
      logger.debug('Sign transaction response:', response.data);
      
      return {
        signatures: response.data.signatures,
        signedTransaction: response.data.signedTransaction,
        txSignature: response.data.txSignature,
      };
    } catch (error: any) {
      logger.error('Failed to sign transaction:', error.response?.data || error.message);
      throw new Error(`Failed to sign transaction: ${error.response?.data?.error || error.message}`);
    }
  },
};
