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
      logger.debug('Fetching token metadata for:', args.inputMint, args.outputMint);
      
      const metadataResponse = await client.get<TokenMetadata[]>('/tokens/getlist', {
        params: {
          mint: `${args.inputMint},${args.outputMint}`,
        },
      });
      
      const tokens = metadataResponse.data;
      
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
          decimals: parseInt(inputToken.Decimals, 10),
          symbol: inputToken.Symbol,
        },
        outputToken: {
          mint: outputToken.Mint,
          decimals: parseInt(outputToken.Decimals, 10),
          symbol: outputToken.Symbol,
        },
        inputAmount: args.inputAmount,
        slippagePercentage: args.slippagePercentage || 1,
        userWallet,
        password: '', // Empty password per MoonGate OAuth design
        transactionSpeed: args.transactionSpeed || 'normal',
      };
      
      logger.debug('Executing swap with payload:', swapPayload);
      
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
      
      logger.error('Failed to swap token:', {
        code: errorCode,
        message: errorMsg,
        fullError: errorData,
      });
      
      // Provide helpful error messages
      if (errorCode === 'NO_ROUTE_FOUND') {
        throw new Error('No swap route found. The tokens might not have enough liquidity.');
      } else if (errorCode === 'INSUFFICIENT_BALANCE') {
        throw new Error('Insufficient token balance for this swap.');
      } else if (errorCode === 'INSUFFICIENT_SOL_BALANCE') {
        throw new Error('Insufficient SOL balance for transaction fees.');
      } else if (errorCode === 'AUTH_REQUIRED') {
        throw new Error('Authentication required. Session may have expired.');
      } else {
        throw new Error(`Swap failed: ${errorMsg}`);
      }
    }
  },
};
