import { AxiosInstance } from 'axios';
import { ToolHandler } from './types.js';
import { createAuthenticatedClient } from '../utils/api.js';
import { logger } from '../utils/logger.js';

/** Token info resolved from portfolio or metadata API */
interface ResolvedToken {
  mint: string;
  decimals: number;
  symbol: string;
  name: string;
  balance: number;
}

/** Normalize portfolio token to a common shape (API structure may vary) */
function normalizePortfolioToken(t: any): { mint: string; decimals: number; symbol: string; name: string; balance: number } | null {
  const mint = t?.mint ?? t?.address ?? t?.Mint ?? t?.tokenAddress;
  if (!mint || typeof mint !== 'string') return null;
  const decimals = t?.decimals != null ? Number(t.decimals) : (t?.Decimals != null ? Number(t.Decimals) : 9);
  const symbol = (t?.symbol ?? t?.Symbol ?? t?.ticker ?? '').toString() || 'UNKNOWN';
  const name = (t?.name ?? t?.Name ?? '').toString() || symbol;
  const balance = Number(t?.balance ?? t?.Balance ?? t?.amount ?? t?.uiAmount ?? 0) || 0;
  return { mint, decimals, symbol, name, balance };
}

/** Fetch portfolio and resolve token by mint, symbol, or name */
async function resolveTokenFromPortfolio(
  client: AxiosInstance,
  userWallet: string,
  tokenMint?: string,
  tokenName?: string,
  tokenSymbol?: string
): Promise<ResolvedToken> {
  const response = await client.post('/api2/wallet-portfolio', { walletAddress: userWallet });
  const data = response.data;
  const rawTokens = data?.tokens ?? data?.tokenList ?? data?.assets ?? [];
  if (!Array.isArray(rawTokens)) {
    throw new Error('Portfolio response has no tokens array');
  }

  const tokens = rawTokens.map(normalizePortfolioToken).filter((t): t is NonNullable<typeof t> => t != null);

  const match = (() => {
    const byMint = (m: string) => tokens.find((t) => t.mint.toLowerCase() === m.toLowerCase());
    const bySymbol = (s: string) => tokens.find((t) => t.symbol.toLowerCase() === s.toLowerCase());
    const byName = (n: string) => tokens.find((t) => t.name.toLowerCase().includes(n.toLowerCase()));

    if (tokenMint) return byMint(tokenMint) ?? null;
    if (tokenSymbol) return bySymbol(tokenSymbol) ?? byName(tokenSymbol) ?? null;
    if (tokenName) return byName(tokenName) ?? bySymbol(tokenName) ?? null;
    return null;
  })();

  if (!match) {
    const hint = tokenMint ? `mint ${tokenMint}` : tokenSymbol || tokenName ? `name/symbol "${tokenSymbol || tokenName}"` : '';
    throw new Error(
      `Token not found in portfolio: ${hint}. ` +
        `Available tokens: ${tokens.map((t) => `${t.symbol} (${t.mint})`).join(', ') || 'none'}`
    );
  }

  return match;
}

export const sendToken: ToolHandler = {
  name: 'send_token',
  description:
    'Send SPL tokens or SOL to another wallet. Provide either tokenMint, or tokenName/tokenSymbol. ' +
    'Fetches portfolio to resolve token, verify balance, and use correct decimals.',
  inputSchema: {
    type: 'object',
    properties: {
      tokenMint: {
        type: 'string',
        description: 'Token mint address (optional if tokenName or tokenSymbol is provided)',
      },
      tokenName: {
        type: 'string',
        description: 'Token name to search for in portfolio (e.g. "Wrapped SOL")',
      },
      tokenSymbol: {
        type: 'string',
        description: 'Token symbol to search for in portfolio (e.g. "SOL", "USDC")',
      },
      toAddress: {
        type: 'string',
        description: 'Recipient wallet address',
      },
      amount: {
        type: 'number',
        description: 'Amount to send (in token units, not lamports)',
      },
      decimals: {
        type: 'number',
        description: 'Token decimals (optional; auto-fetched from portfolio if not provided)',
      },
      userWallet: {
        type: 'string',
        description: 'Sender wallet address (will be auto-filled if not provided)',
      },
    },
    required: ['toAddress', 'amount'],
  },
  handler: async (args, context) => {
    const tokenMint = typeof args.tokenMint === 'string' ? args.tokenMint.trim() : undefined;
    const tokenName = typeof args.tokenName === 'string' ? args.tokenName.trim() : undefined;
    const tokenSymbol = typeof args.tokenSymbol === 'string' ? args.tokenSymbol.trim() : undefined;

    if (!tokenMint && !tokenName && !tokenSymbol) {
      throw new Error('Provide at least one of: tokenMint, tokenName, or tokenSymbol');
    }

    try {
      const token = await context.sessionManager.getToken();
      const client = createAuthenticatedClient(token);

      let userWallet = args.userWallet;
      if (!userWallet) {
        const walletResponse = await client.get('/api2/getwalletaddress');
        userWallet = walletResponse.data.publicKey;
      }

      // Resolve token from portfolio (mint, symbol, or name)
      const resolved = await resolveTokenFromPortfolio(
        client,
        userWallet,
        tokenMint || undefined,
        tokenName || undefined,
        tokenSymbol || undefined
      );

      const decimals = args.decimals != null ? Number(args.decimals) : resolved.decimals;

      if (resolved.balance < args.amount) {
        throw new Error(
          `Insufficient balance. You have ${resolved.balance} ${resolved.symbol}, but tried to send ${args.amount}.`
        );
      }

      const payload = {
        tokenMint: resolved.mint,
        toAddress: args.toAddress,
        amount: args.amount,
        decimals,
        userWallet,
        password: '',
      };

      logger.info('Sending token with payload:', JSON.stringify(payload, null, 2));

      const response = await client.post('/sending/sendtoken', payload);

      logger.info('Send token response:', response.data);

      return {
        success: response.data.success !== false,
        signature: response.data.signature,
        error: response.data.error,
        token: resolved.symbol,
        amount: args.amount,
      };
    } catch (error: any) {
      if (error.message?.includes('not found in portfolio') || error.message?.includes('Insufficient balance')) {
        throw error;
      }
      const errorData = error.response?.data;
      const status = error.response?.status;
      logger.error('Failed to send token:', {
        status,
        errorData,
        requestPayload: args,
      });
      const errorMsg = errorData?.error || errorData?.details || error.message;
      const fullErrorDetails = errorData ? JSON.stringify(errorData, null, 2) : errorMsg;
      throw new Error(`Failed to send token (HTTP ${status || '?'}): ${errorMsg}\n\nFull error: ${fullErrorDetails}`);
    }
  },
};
