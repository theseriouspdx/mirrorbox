const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');

const dbManager = require('../state/db-manager.js');
const GraphStore = require('./graph-store.js');

class GraphMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mbo-graph-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.graphStore = new GraphStore(dbManager);
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'graph_query_impact',
          description: 'Given a node ID, return all nodes that would be affected by a change (up to 3 degrees of separation).',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'The URI ID of the node.' },
            },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_callers',
          description: 'Return all nodes that call a given function.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'The URI ID of the node.' },
            },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_dependencies',
          description: 'Return the full dependency chain for a file or function.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'The URI ID of the node.' },
            },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_coverage',
          description: 'Return tests that cover a given function or file.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'The URI ID of the node.' },
            },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_search',
          description: 'Search nodes by name, path, or type.',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Search pattern for name, path, or id.' },
            },
            required: ['pattern'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'graph_query_impact': {
            const { nodeId } = request.params.arguments;
            if (!nodeId) throw new McpError(ErrorCode.InvalidParams, 'nodeId is required');
            const impact = this.graphStore.getImpact(nodeId);
            return {
              content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }],
            };
          }
          
          case 'graph_query_callers': {
            const { nodeId } = request.params.arguments;
            if (!nodeId) throw new McpError(ErrorCode.InvalidParams, 'nodeId is required');
            const callers = this.graphStore.getCallers(nodeId);
            return {
              content: [{ type: 'text', text: JSON.stringify(callers, null, 2) }],
            };
          }
          
          case 'graph_query_dependencies': {
            const { nodeId } = request.params.arguments;
            if (!nodeId) throw new McpError(ErrorCode.InvalidParams, 'nodeId is required');
            const dependencies = this.graphStore.getDependencies(nodeId);
            return {
              content: [{ type: 'text', text: JSON.stringify(dependencies, null, 2) }],
            };
          }
          
          case 'graph_query_coverage': {
            const { nodeId } = request.params.arguments;
            if (!nodeId) throw new McpError(ErrorCode.InvalidParams, 'nodeId is required');
            const coveringTests = this.graphStore.getCoverage(nodeId);
            return {
              content: [{ type: 'text', text: JSON.stringify(coveringTests, null, 2) }],
            };
          }

          case 'graph_search': {
            const { pattern } = request.params.arguments;
            if (!pattern) throw new McpError(ErrorCode.InvalidParams, 'pattern is required');
            const results = this.graphStore.search(pattern);
            return {
              content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Graph MCP Server running on stdio');
  }
}

const server = new GraphMCPServer();
server.run().catch(console.error);

module.exports = server;
