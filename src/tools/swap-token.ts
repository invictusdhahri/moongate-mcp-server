import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';
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
  description: 'Swap tokens using MoonGate DEX integration (Jupiter). Fetches token metadata automatically.',
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
    required: ['inputMint', 'outputMint', 'inputAmount'],
  },
  handler: async (args, context) => {
    const inputMint = stripQuotes(String(args.inputMint ?? ''));
    const outputMint = stripQuotes(String(args.outputMint ?? ''));

    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);

      // Step 1: Get token metadata (fetch if not provided, or use provided values)
      let inputTokenData: { decimals: string; symbol: string };
      let outputTokenData: { decimals: string; symbol: string };

      const needsFetch = !args.inputDecimals || !args.inputSymbol || !args.outputDecimals || !args.outputSymbol;

      if (needsFetch) {
        logger.info('Fetching token metadata for:', inputMint, outputMint);
        
        try {
          const metadataResponse = await client.get<TokenMetadata[]>('/tokens/getlist', {
            params: {
              mint: `${inputMint},${outputMint}`,
            },
          });

          const tokens = metadataResponse.data;
          logger.info('Token metadata response:', JSON.stringify(tokens, null, 2));

          const fetchedInput = tokens?.find((t) => t.Mint === inputMint);
          const fetchedOutput = tokens?.find((t) => t.Mint === outputMint);

          inputTokenData = {
            decimals: args.inputDecimals ? String(args.inputDecimals) : (fetchedInput?.Decimals || '9'),
            symbol: args.inputSymbol || fetchedInput?.Symbol || 'UNKNOWN',
          };

          outputTokenData = {
            decimals: args.outputDecimals ? String(args.outputDecimals) : (fetchedOutput?.Decimals || '9'),
            symbol: args.outputSymbol || fetchedOutput?.Symbol || 'UNKNOWN',
          };
        } catch (metadataError: any) {
          logger.warn('Failed to fetch metadata, using provided values or defaults:', metadataError.message);
          
          // Fall back to provided values or defaults
          inputTokenData = {
            decimals: args.inputDecimals ? String(args.inputDecimals) : '9',
            symbol: args.inputSymbol || 'TOKEN',
          };
          outputTokenData = {
            decimals: args.outputDecimals ? String(args.outputDecimals) : '9',
            symbol: args.outputSymbol || 'TOKEN',
          };
        }
      } else {
        // Use provided values
        inputTokenData = {
          decimals: String(args.inputDecimals),
          symbol: args.inputSymbol!,
        };
        outputTokenData = {
          decimals: String(args.outputDecimals),
          symbol: args.outputSymbol!,
        };
        logger.info('Using provided token metadata (skipping fetch)');
      }
      
      logger.debug('Token metadata:', {
        input: `${inputTokenData.symbol} (${inputTokenData.decimals} decimals)`,
        output: `${outputTokenData.symbol} (${outputTokenData.decimals} decimals)`,
      });
      
      // Step 2: Get user wallet address
      const walletResponse = await client.get('/api2/getwalletaddress');
      const userWallet = walletResponse.data.publicKey;
      
      logger.debug('User wallet:', userWallet);
      
      // Step 3: Execute the swap
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
