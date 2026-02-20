import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from './session/manager.js';
import { tools } from './tools/index.js';
import { logger } from './utils/logger.js';

export class MoonGateMCPServer {
  private server: Server;
  private sessionManager: SessionManager;

  constructor() {
    this.server = new Server(
      {
        name: 'moongate-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sessionManager = new SessionManager();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      try {
        logger.debug(`Executing tool: ${toolName}`, request.params.arguments);
        
        const result = await tool.handler(request.params.arguments || {}, {
          sessionManager: this.sessionManager,
        });

        logger.debug(`Tool ${toolName} completed successfully`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Tool ${toolName} failed:`, error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error.message || 'Unknown error',
                  tool: toolName,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    logger.info('Initializing MoonGate MCP Server...');

    // Initialize session (authenticate)
    await this.sessionManager.initialize();

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('MoonGate MCP Server running');
  }
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MoonGateMCPServer();
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
