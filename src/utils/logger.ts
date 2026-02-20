/**
 * Logger that writes to stderr (MCP uses stdout for protocol messages)
 */

// Debug mode is ON by default (set MOONGATE_MCP_DEBUG=false to disable)
const DEBUG = process.env.MOONGATE_MCP_DEBUG !== 'false';

export const logger = {
  debug: (...args: any[]) => {
    if (DEBUG) {
      console.error('[DEBUG]', ...args);
    }
  },
  
  info: (...args: any[]) => {
    console.error('[INFO]', ...args);
  },
  
  warn: (...args: any[]) => {
    console.error('[WARN]', ...args);
  },
  
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};
