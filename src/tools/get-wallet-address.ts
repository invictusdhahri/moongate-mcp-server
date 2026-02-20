import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const getWalletAddress: ToolHandler = {
  name: 'get_wallet_address',
  description: 'Get the public key (wallet address) of the authenticated MoonGate user',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      const response = await client.get('/api2/getwalletaddress');
      
      logger.debug('Wallet address response:', response.data);
      
      return {
        publicKey: response.data.publicKey,
      };
    } catch (error: any) {
      logger.error('Failed to get wallet address:', error.response?.data || error.message);
      throw new Error(`Failed to get wallet address: ${error.response?.data?.error || error.message}`);
    }
  },
};
