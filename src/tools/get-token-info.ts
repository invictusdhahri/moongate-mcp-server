import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

interface TokenInfo {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: string | number;
  price?: number;
  priceUSD?: string;
  marketCap?: string | number;
  circulatingMarketCap?: string | number;
  liquidity?: string | number;
  holdersCount?: number;
  holders?: number;
  transactionsCount?: number;
  txnCount24h?: number;
  buyCount24h?: number;
  sellCount24h?: number;
  buyerSentimentPercent?: number;
  createdAt?: number;
  topHoldersPercent?: number;
  devHoldersPercent?: number;
  snipersPercent?: number;
  lockedLiquidityPercent?: number;
  proTradersCount?: number;
  oldWalletPercent?: number;
  mintable?: boolean;
  freezable?: boolean;
  dexPaidStatus?: string;
  socialLinks?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
  };
  firstExchange?: {
    id?: string;
    name?: string;
    iconUrl?: string;
  };
  isScam?: boolean | null;
  isVerified?: boolean;
}

export const getTokenInfo: ToolHandler = {
  name: 'get_token_info',
  description: 'Get detailed token information including price, liquidity, holder count, social links, and rugpull indicators. Useful for analyzing token safety before swapping or investing.',
  inputSchema: {
    type: 'object',
    properties: {
      tokenMint: {
        type: 'string',
        description: 'Token mint address to get information for',
      },
      tokenName: {
        type: 'string',
        description: 'Token name or symbol (will search for mint address first)',
      },
    },
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);

      let tokenMint = args.tokenMint;

      // If token name/symbol provided, search for it first
      if (!tokenMint && args.tokenName) {
        logger.info(`Searching for token: "${args.tokenName}"`);
        
        const searchResponse = await client.get<{ success: boolean; data: { tokens: any[] } }>(
          '/api/tokens/search',
          {
            params: {
              q: args.tokenName,
              limit: 1,
              offset: 0,
              excludeScam: true,
              sortBy: 'circulatingMarketCap',
              sortDirection: 'desc',
              predefinedFilters: JSON.stringify(['BASE', 'SEARCH_QUALITY']),
            },
          }
        );

        const tokens = searchResponse.data?.data?.tokens || [];
        if (tokens.length === 0) {
          throw new Error(`Token "${args.tokenName}" not found`);
        }
        
        tokenMint = tokens[0].address;
        logger.info(`Resolved "${args.tokenName}" to ${tokenMint}`);
      }

      if (!tokenMint) {
        throw new Error('Provide either tokenMint or tokenName');
      }

      logger.info(`Fetching token info for: ${tokenMint}`);

      const response = await client.get<TokenInfo>(
        '/tokens/token-info',
        {
          params: { tokenMint },
        }
      );

      const tokenData = response.data;

      if (!tokenData) {
        throw new Error('Token information not available');
      }

      // Calculate rugpull risk indicators
      const riskIndicators = [];
      const safetyIndicators = [];

      // Check liquidity
      const liquidity = tokenData.liquidity ? parseFloat(String(tokenData.liquidity)) : 0;
      if (liquidity < 1000) {
        riskIndicators.push('Low liquidity (<$1K) - high rugpull risk');
      } else if (liquidity < 10000) {
        riskIndicators.push('Moderate liquidity (<$10K)');
      } else {
        safetyIndicators.push(`Good liquidity ($${(liquidity / 1000).toFixed(1)}K)`);
      }

      // Check holders
      const holders = tokenData.holdersCount || tokenData.holders || 0;
      if (holders) {
        if (holders < 100) {
          riskIndicators.push('Very few holders (<100)');
        } else if (holders < 1000) {
          riskIndicators.push('Low holder count (<1K)');
        } else {
          safetyIndicators.push(`${holders.toLocaleString()} holders`);
        }
      }

      // Check top holders concentration
      if (tokenData.topHoldersPercent) {
        if (tokenData.topHoldersPercent > 80) {
          riskIndicators.push(`Extremely concentrated (top holders: ${tokenData.topHoldersPercent.toFixed(1)}%)`);
        } else if (tokenData.topHoldersPercent > 50) {
          riskIndicators.push(`High concentration (top holders: ${tokenData.topHoldersPercent.toFixed(1)}%)`);
        } else {
          safetyIndicators.push(`Good distribution (top holders: ${tokenData.topHoldersPercent.toFixed(1)}%)`);
        }
      }

      // Check mintable/freezable
      if (tokenData.mintable === true) {
        riskIndicators.push('⚠️ Mintable (supply can be increased)');
      }
      if (tokenData.freezable === true) {
        riskIndicators.push('⚠️ Freezable (accounts can be frozen)');
      }
      if (tokenData.mintable === false && tokenData.freezable === false) {
        safetyIndicators.push('✓ Not mintable or freezable');
      }

      // Check locked liquidity
      if (tokenData.lockedLiquidityPercent !== undefined) {
        if (tokenData.lockedLiquidityPercent < 50) {
          riskIndicators.push(`Low locked liquidity (${tokenData.lockedLiquidityPercent}%)`);
        } else {
          safetyIndicators.push(`${tokenData.lockedLiquidityPercent}% liquidity locked`);
        }
      }

      // Check snipers
      if (tokenData.snipersPercent && tokenData.snipersPercent > 10) {
        riskIndicators.push(`High sniper activity (${tokenData.snipersPercent.toFixed(1)}%)`);
      }

      // Check dev holdings
      if (tokenData.devHoldersPercent && tokenData.devHoldersPercent > 10) {
        riskIndicators.push(`High dev holdings (${tokenData.devHoldersPercent.toFixed(1)}%)`);
      }

      // Check age
      if (tokenData.createdAt) {
        const ageInDays = (Date.now() - tokenData.createdAt * 1000) / (1000 * 60 * 60 * 24);
        if (ageInDays < 1) {
          riskIndicators.push('Very new token (<1 day old)');
        } else if (ageInDays < 7) {
          riskIndicators.push(`New token (${ageInDays.toFixed(0)} days old)`);
        } else {
          safetyIndicators.push(`Established (${ageInDays.toFixed(0)} days old)`);
        }
      }

      // Check social presence
      const hasSocials = tokenData.socialLinks && (
        tokenData.socialLinks.twitter || 
        tokenData.socialLinks.website || 
        tokenData.socialLinks.telegram
      );
      if (!hasSocials) {
        riskIndicators.push('No social media links');
      } else {
        safetyIndicators.push('Has social media presence');
      }

      // Check buyer sentiment
      if (tokenData.buyerSentimentPercent !== undefined) {
        if (tokenData.buyerSentimentPercent < 30) {
          riskIndicators.push(`Very bearish sentiment (${tokenData.buyerSentimentPercent.toFixed(1)}% buyers)`);
        } else if (tokenData.buyerSentimentPercent > 60) {
          safetyIndicators.push(`Bullish sentiment (${tokenData.buyerSentimentPercent.toFixed(1)}% buyers)`);
        }
      }

      return {
        token: {
          mint: tokenMint,
          name: tokenData.name,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals,
          supply: tokenData.supply,
          createdAt: tokenData.createdAt,
        },
        price: {
          usd: tokenData.price || tokenData.priceUSD,
          marketCap: tokenData.marketCap,
          circulatingMarketCap: tokenData.circulatingMarketCap,
        },
        security: {
          mintable: tokenData.mintable,
          freezable: tokenData.freezable,
          lockedLiquidityPercent: tokenData.lockedLiquidityPercent,
          topHoldersPercent: tokenData.topHoldersPercent,
          devHoldersPercent: tokenData.devHoldersPercent,
          snipersPercent: tokenData.snipersPercent,
        },
        market: {
          liquidity: tokenData.liquidity,
          holders: holders,
          transactionsCount: tokenData.transactionsCount,
          buyCount24h: tokenData.buyCount24h,
          sellCount24h: tokenData.sellCount24h,
          buyerSentimentPercent: tokenData.buyerSentimentPercent,
          proTradersCount: tokenData.proTradersCount,
          oldWalletPercent: tokenData.oldWalletPercent,
        },
        exchange: tokenData.firstExchange,
        socialLinks: tokenData.socialLinks,
        riskAssessment: {
          riskIndicators: riskIndicators.length > 0 ? riskIndicators : ['No major red flags detected'],
          safetyIndicators: safetyIndicators.length > 0 ? safetyIndicators : [],
          overallRisk: riskIndicators.length === 0 ? 'LOW' : 
                       riskIndicators.length <= 2 ? 'MODERATE' : 'HIGH',
          recommendation: 
            riskIndicators.length >= 5 ? '🚫 HIGH RISK - Not recommended' :
            riskIndicators.length >= 3 ? '⚠️ MODERATE RISK - Use caution, do more research' :
            '✓ Appears relatively safe, but always DYOR (Do Your Own Research)',
        },
      };
    } catch (error: any) {
      logger.error('Failed to get token info:', error.response?.data || error.message);
      throw new Error(`Failed to get token info: ${error.response?.data?.error || error.message}`);
    }
  },
};
