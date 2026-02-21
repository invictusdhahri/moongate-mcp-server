import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

interface SearchTokenResult {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  imageLarge?: string;
  imageThumb?: string;
  imageSmall?: string;
  priceUSD?: string;
  marketCap?: string;
  volume24h?: string;
  holders?: number;
}

export const searchToken: ToolHandler = {
  name: 'search_token',
  description: 'Search for Solana tokens by name, symbol, or mint address. Returns token details including mint address, decimals, price, and market data.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query: token name (e.g. "Solana"), symbol (e.g. "SOL"), or mint address',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        default: 10,
      },
    },
    required: ['query'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);

      const limit = Math.min(args.limit || 10, 100);
      
      logger.info(`Searching for token: "${args.query}"`);

      const response = await client.get<{ success: boolean; data: { tokens: SearchTokenResult[] } }>(
        '/api/tokens/search',
        {
          params: {
            q: args.query,
            limit,
            offset: 0,
            excludeScam: true,
            sortBy: 'circulatingMarketCap',
            sortDirection: 'desc',
            predefinedFilters: JSON.stringify(['BASE', 'SEARCH_QUALITY']),
          },
        }
      );

      const tokens = response.data?.data?.tokens || [];
      
      if (tokens.length === 0) {
        return {
          success: true,
          results: [],
          message: `No tokens found matching "${args.query}"`,
        };
      }

      logger.info(`Found ${tokens.length} token(s) for query: "${args.query}"`);

      return {
        success: true,
        results: tokens.map((t) => ({
          mint: t.address,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          price: t.priceUSD ? `$${t.priceUSD}` : undefined,
          marketCap: t.marketCap,
          volume24h: t.volume24h,
          holders: t.holders,
          image: t.imageSmall || t.imageThumb || t.imageLarge,
        })),
        count: tokens.length,
      };
    } catch (error: any) {
      logger.error('Failed to search tokens:', error.response?.data || error.message);
      throw new Error(`Token search failed: ${error.response?.data?.error || error.message}`);
    }
  },
};
