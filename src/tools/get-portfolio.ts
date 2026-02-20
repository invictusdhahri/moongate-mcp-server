import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

export const getPortfolio: ToolHandler = {
  name: 'get_portfolio',
  description: 'Get the token portfolio (balances, tokens, NFTs) for a wallet address',
  inputSchema: {
    type: 'object',
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Wallet address to get portfolio for (defaults to authenticated user wallet)',
      },
    },
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      // Get user wallet if not provided
      let walletAddress = args.walletAddress;
      if (!walletAddress) {
        const walletResponse = await client.get('/api2/getwalletaddress');
        walletAddress = walletResponse.data.publicKey;
      }
      
      const response = await client.post('/api2/wallet-portfolio', {
        walletAddress,
      });
      
      logger.debug('Portfolio response:', response.data);
      
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get portfolio:', error.response?.data || error.message);
      throw new Error(`Failed to get portfolio: ${error.response?.data?.error || error.message}`);
    }
  },
};
