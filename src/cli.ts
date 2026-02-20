import 'dotenv/config';
import { MoonGateMCPServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    const server = new MoonGateMCPServer();
    await server.start();
  } catch (error: any) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
