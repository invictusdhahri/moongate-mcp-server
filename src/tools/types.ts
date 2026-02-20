import { SessionManager } from '../session/manager.js';

export interface ToolContext {
  sessionManager: SessionManager;
}

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, context: ToolContext) => Promise<any>;
}
