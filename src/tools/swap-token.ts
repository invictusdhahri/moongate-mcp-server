import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

interface TokenMetadata {
  Name: string;
  Symbol: string;
  Mint: string;
  Decimals: string;
  LogoURI: string;
  Tags: string[];
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
        description: 'Amount of input token to swap',
      },
      slippagePercentage: {
        type: 'number',
        description: 'Slippage tolerance as percentage (e.g., 1 = 1%, 0.5 = 0.5%)',
        default: 1,
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
    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);
      
      // Step 1: Fetch token metadata for both tokens
      logger.info('Fetching token metadata for:', args.inputMint, args.outputMint);
      
      const metadataResponse = await client.get<TokenMetadata[]>('/tokens/getlist', {
        params: {
          mint: `${args.inputMint},${args.outputMint}`,
        },
      });
      
      const tokens = metadataResponse.data;
      logger.info('Token metadata response:', JSON.stringify(tokens, null, 2));
      
      if (!tokens || tokens.length < 2) {
        throw new Error('Failed to fetch token metadata. Make sure both token mints are valid.');
      }
      
      const inputToken = tokens.find((t) => t.Mint === args.inputMint);
      const outputToken = tokens.find((t) => t.Mint === args.outputMint);
      
      if (!inputToken || !outputToken) {
        throw new Error(`Token metadata not found. Input: ${!!inputToken}, Output: ${!!outputToken}`);
      }
      
      logger.debug('Token metadata fetched:', {
        input: `${inputToken.Symbol} (${inputToken.Decimals} decimals)`,
        output: `${outputToken.Symbol} (${outputToken.Decimals} decimals)`,
      });
      
      // Step 2: Get user wallet address
      const walletResponse = await client.get('/api2/getwalletaddress');
      const userWallet = walletResponse.data.publicKey;
      
      logger.debug('User wallet:', userWallet);
      
      // Step 3: Execute the swap
      const swapPayload = {
        inputToken: {
          mint: inputToken.Mint,
          decimals: inputToken.Decimals, // Keep as string (API expects string, not number)
          symbol: inputToken.Symbol,
        },
        outputToken: {
          mint: outputToken.Mint,
          decimals: outputToken.Decimals, // Keep as string (API expects string, not number)
          symbol: outputToken.Symbol,
        },
        inputAmount: args.inputAmount,
        slippagePercentage: args.slippagePercentage || 1,
        userWallet,
        password: '', // Empty password per MoonGate OAuth design
        transactionSpeed: args.transactionSpeed || 'normal',
      };
      
      logger.info('Executing swap with payload:', JSON.stringify(swapPayload, null, 2));
      
      const response = await client.post('/pump/swap', swapPayload);
      
      logger.debug('Swap response:', response.data);
      
      if (response.data.success && response.data.signature) {
        return {
          success: true,
          signature: response.data.signature,
          transactionCount: response.data.transactionCount,
          inputToken: inputToken.Symbol,
          outputToken: outputToken.Symbol,
          inputAmount: args.inputAmount,
        };
      } else {
        throw new Error(response.data.error || 'Swap failed without error message');
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorCode = errorData?.errorCode;
      const errorMsg = errorData?.error || errorData?.details || error.message;
      const status = error.response?.status;
      
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
