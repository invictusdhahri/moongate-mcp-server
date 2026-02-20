import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const signMessage: ToolHandler = {
  name: 'sign_message',
  description: 'Sign a message with the MoonGate wallet. Message can be a string or array of bytes.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        description: 'The message to sign (string or array of numbers representing bytes)',
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'number' } },
        ],
      },
    },
    required: ['message'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      const response = await client.post('/api/wallet/sign-message', {
        message: args.message,
        password: '', // Empty password per spec
      });
      
      logger.debug('Sign message response:', response.data);
      
      return {
        signature: response.data.signature,
      };
    } catch (error: any) {
      logger.error('Failed to sign message:', error.response?.data || error.message);
      throw new Error(`Failed to sign message: ${error.response?.data?.error || error.message}`);
    }
  },
};
