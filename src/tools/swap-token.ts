import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';
import { AxiosInstance } from 'axios';
import fs from 'fs';
import os from 'os';

interface TokenMetadata {
  Name: string;
  Symbol: string;
  Mint: string;
  Decimals: string;
  LogoURI: string;
  Tags: string[];
}

interface SearchTokenResult {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUSD?: string;
  marketCap?: string;
}

/** Search for a token by name/symbol and return mint address + decimals */
async function searchTokenByName(
  client: AxiosInstance,
  query: string
): Promise<{ mint: string; decimals: number; symbol: string; name: string } | null> {
  try {
    logger.info(`Searching for token: "${query}"`);
    
    const response = await client.get<{ success: boolean; data: { tokens: SearchTokenResult[] } }>(
      '/api/tokens/search',
      {
        params: {
          q: query,
          limit: 5,
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
      return null;
    }

    const topResult = tokens[0];
    logger.info(`Found token: ${topResult.symbol} (${topResult.name}) - ${topResult.address}`);

    return {
      mint: topResult.address,
      decimals: topResult.decimals,
      symbol: topResult.symbol,
      name: topResult.name,
    };
  } catch (error: any) {
    logger.warn(`Token search failed for "${query}":`, error.message);
    return null;
  }
}

const DEBUG_LOG = '/tmp/moongate-mcp-debug.log';

function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) + '\n' : ''}\n`;
  fs.appendFileSync(DEBUG_LOG, logLine);
  console.error(logLine); // Also try console.error
}

/** Strip accidental surrounding quotes (e.g. from JSON double-encoding) */
function stripQuotes(s: string): string {
  if (typeof s !== 'string') return String(s);
  let out = s.trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  return out;
}

export const swapToken: ToolHandler = {
  name: 'swap_token',
  description: 'Swap tokens using MoonGate DEX integration (Jupiter). Supports searching by token name/symbol or mint address.',
  inputSchema: {
    type: 'object',
    properties: {
      inputMint: {
        type: 'string',
        description: 'Input token mint address (optional if inputToken is provided)',
      },
      inputToken: {
        type: 'string',
        description: 'Input token name or symbol (e.g. "SOL", "USDC") - will search for mint address',
      },
      outputMint: {
        type: 'string',
        description: 'Output token mint address (optional if outputToken is provided)',
      },
      outputToken: {
        type: 'string',
        description: 'Output token name or symbol (e.g. "SOL", "USDC") - will search for mint address',
      },
      inputAmount: {
        type: 'number',
        description: 'Amount of input token to swap (human-readable, e.g. 190.82)',
      },
      inputDecimals: {
        type: 'number',
        description: 'Input token decimals (optional, will be fetched if not provided)',
      },
      inputSymbol: {
        type: 'string',
        description: 'Input token symbol (optional, will be fetched if not provided)',
      },
      outputDecimals: {
        type: 'number',
        description: 'Output token decimals (optional, will be fetched if not provided)',
      },
      outputSymbol: {
        type: 'string',
        description: 'Output token symbol (optional, will be fetched if not provided)',
      },
      slippagePercentage: {
        type: 'number',
        description: 'Slippage tolerance in basis points (e.g., 100 = 1%, 300 = 3%)',
        default: 100,
      },
      transactionSpeed: {
        type: 'string',
        enum: ['slow', 'normal', 'fast'],
        description: 'Transaction speed/priority',
        default: 'normal',
      },
    },
    required: ['inputAmount'],
  },
  handler: async (args, context) => {
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);

      // Resolve input token (mint or name/symbol)
      let inputMint: string;
      let inputTokenData: { decimals: string; symbol: string };

      if (args.inputMint) {
        inputMint = stripQuotes(String(args.inputMint));
        inputTokenData = {
          decimals: args.inputDecimals ? String(args.inputDecimals) : '9',
          symbol: args.inputSymbol || 'TOKEN',
        };
      } else if (args.inputToken) {
        const searchResult = await searchTokenByName(client, String(args.inputToken));
        if (!searchResult) {
          throw new Error(`Input token "${args.inputToken}" not found. Try providing the mint address instead.`);
        }
        inputMint = searchResult.mint;
        inputTokenData = {
          decimals: String(searchResult.decimals),
          symbol: searchResult.symbol,
        };
        logger.info(`Resolved input token "${args.inputToken}" to ${searchResult.symbol} (${inputMint})`);
      } else {
        throw new Error('Provide either inputMint or inputToken (name/symbol)');
      }

      // Resolve output token (mint or name/symbol)
      let outputMint: string;
      let outputTokenData: { decimals: string; symbol: string };

      if (args.outputMint) {
        outputMint = stripQuotes(String(args.outputMint));
        outputTokenData = {
          decimals: args.outputDecimals ? String(args.outputDecimals) : '9',
          symbol: args.outputSymbol || 'TOKEN',
        };
      } else if (args.outputToken) {
        const searchResult = await searchTokenByName(client, String(args.outputToken));
        if (!searchResult) {
          throw new Error(`Output token "${args.outputToken}" not found. Try providing the mint address instead.`);
        }
        outputMint = searchResult.mint;
        outputTokenData = {
          decimals: String(searchResult.decimals),
          symbol: searchResult.symbol,
        };
        logger.info(`Resolved output token "${args.outputToken}" to ${searchResult.symbol} (${outputMint})`);
      } else {
        throw new Error('Provide either outputMint or outputToken (name/symbol)');
      }

      // Fetch additional metadata if needed (fallback for missing decimals/symbols)
      const needsMetadataFetch = 
        (inputTokenData.symbol === 'TOKEN' && !args.inputSymbol) ||
        (outputTokenData.symbol === 'TOKEN' && !args.outputSymbol);

      if (needsMetadataFetch) {
        try {
          const metadataResponse = await client.get<TokenMetadata[]>('/tokens/getlist', {
            params: { mint: `${inputMint},${outputMint}` },
          });

          const tokens = metadataResponse.data;
          const fetchedInput = tokens?.find((t) => t.Mint === inputMint);
          const fetchedOutput = tokens?.find((t) => t.Mint === outputMint);

          if (fetchedInput && inputTokenData.symbol === 'TOKEN') {
            inputTokenData.symbol = fetchedInput.Symbol;
            inputTokenData.decimals = fetchedInput.Decimals;
          }
          if (fetchedOutput && outputTokenData.symbol === 'TOKEN') {
            outputTokenData.symbol = fetchedOutput.Symbol;
            outputTokenData.decimals = fetchedOutput.Decimals;
          }
        } catch (_) {
          logger.warn('Metadata fetch failed, using resolved values');
        }
      }

      logger.debug('Final token data:', {
        input: `${inputTokenData.symbol} (${inputTokenData.decimals} decimals) - ${inputMint}`,
        output: `${outputTokenData.symbol} (${outputTokenData.decimals} decimals) - ${outputMint}`,
      });

      // Get user wallet address
      const walletResponse = await client.get('/api2/getwalletaddress');
      const userWallet = walletResponse.data.publicKey;

      // Execute the swap
      const swapPayload = {
        inputToken: {
          mint: inputMint,
          decimals: inputTokenData.decimals,
          symbol: inputTokenData.symbol,
        },
        outputToken: {
          mint: outputMint,
          decimals: outputTokenData.decimals,
          symbol: outputTokenData.symbol,
        },
        inputAmount: args.inputAmount,
        slippagePercentage: args.slippagePercentage ?? 100,
        userWallet,
        password: '', // Empty password per MoonGate OAuth design
        transactionSpeed: args.transactionSpeed || 'normal',
      };
      
      debugLog('========== SWAP REQUEST ==========');
      debugLog('URL: https://wallet.moongate.one/pump/swap');
      debugLog('Payload:', swapPayload);
      debugLog('Token (first 50 chars): ' + token.substring(0, 50) + '...');
      debugLog('===================================');
      
      logger.info('Executing swap with payload:', JSON.stringify(swapPayload, null, 2));
      
      const response = await client.post('/pump/swap', swapPayload);
      
      debugLog('========== SWAP RESPONSE ==========');
      debugLog('Status: ' + response.status);
      debugLog('Data:', response.data);
      debugLog('===================================');
      
      logger.debug('Swap response:', response.data);
      
      if (response.data.success) {
        return {
          success: response.data.success,
          signature: response.data.signature,
          inputToken: response.data.inputToken ?? inputMint,
          outputToken: response.data.outputToken ?? outputMint,
          inputAmount: response.data.inputAmount ?? args.inputAmount,
          transactionCount: response.data.transactionCount,
          status: response.data.status ?? 'success',
        };
      } else {
        throw new Error(response.data.error || 'Swap failed without error message');
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorCode = errorData?.errorCode;
      const errorMsg = errorData?.error || errorData?.details || error.message;
      const status = error.response?.status;
      
      debugLog('========== SWAP ERROR ==========');
      debugLog('HTTP Status: ' + status);
      debugLog('Error Code: ' + errorCode);
      debugLog('Error Message: ' + errorMsg);
      debugLog('Full Error Data:', errorData);
      debugLog('Request was:', {
        inputMint: args.inputMint,
        outputMint: args.outputMint,
        inputAmount: args.inputAmount,
      });
      debugLog('================================');
      
      logger.error('Failed to swap token:', {
        status,
        code: errorCode,
        message: errorMsg,
        fullError: errorData,
        requestPayload: {
          inputMint: args.inputMint,
          outputMint: args.outputMint,
          inputAmount: args.inputAmount,
        },
      });
      
      // Provide helpful error messages with full context
      if (errorCode === 'NO_ROUTE_FOUND') {
        throw new Error('No swap route found. The tokens might not have enough liquidity.');
      } else if (errorCode === 'INSUFFICIENT_BALANCE') {
        throw new Error('Insufficient token balance for this swap.');
      } else if (errorCode === 'INSUFFICIENT_SOL_BALANCE') {
        throw new Error('Insufficient SOL balance for transaction fees.');
      } else if (errorCode === 'AUTH_REQUIRED') {
        throw new Error('Authentication required. Session may have expired.');
      } else {
        // Include full error details in the exception
        const fullErrorDetails = errorData ? JSON.stringify(errorData, null, 2) : errorMsg;
        throw new Error(`Swap failed (HTTP ${status}): ${errorMsg}\n\nFull error: ${fullErrorDetails}`);
      }
    }
  },
};
