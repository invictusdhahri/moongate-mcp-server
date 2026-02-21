import { ToolHandler } from './types.js';
import { getWalletAddress } from './get-wallet-address.js';
import { signMessage } from './sign-message.js';
import { signTransaction } from './sign-transaction.js';
import { sendToken } from './send-token.js';
import { getPortfolio } from './get-portfolio.js';
import { swapToken } from './swap-token.js';
import { searchToken } from './search-token.js';
import { getTokenInfo } from './get-token-info.js';

export const tools: ToolHandler[] = [
  getWalletAddress,
  signMessage,
  signTransaction,
  sendToken,
  getPortfolio,
  swapToken,
  searchToken,
  getTokenInfo,
];

export { ToolHandler, ToolContext } from './types.js';
