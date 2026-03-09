const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');
const path = require('path');
const fs = require('fs');

const { DBManager } = require('../state/db-manager.js');
const GraphStore = require('./graph-store.js');
const StaticScanner = require('./static-scanner.js');

class GraphMCPServer {
  constructor() {
    this.parseArgs();
    
    this.server = new Server(
      {
        name: `mbo-graph-server-${this.mode}`,
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const dbPath = this.mode === 'dev' 
      ? path.join(this.root, '.dev/data/dev-graph.db')
      : path.join(this.root, 'data/mirrorbox.db');

    this.db = new DBManager(dbPath);
    this.graphStore = new GraphStore(this.db);
    this.scanner = new StaticScanner(this.graphStore, {
      instanceType: this.mode,
      scanRoots: [path.join(this.root, 'src')]
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    const shutdown = async () => {
      console.error('[MCP] Shutting down graph server...');
      await this.server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
      console.error('[CRITICAL] Uncaught Exception:', error);
      shutdown();
    });
  }

  parseArgs() {
    const args = process.argv.slice(2);
    this.mode = 'runtime';
    this.root = process.cwd();

    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--mode=')) {
        this.mode = args[i].split('=')[1];
      } else if (args[i].startsWith('--root=')) {
        this.root = args[i].split('=')[1];
      }
    }
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
        {
          name: 'graph_update_task',
          description: 'Update the graph after a task completion by re-scanning modified files.',
          inputSchema: {
            type: 'object',
            properties: {
              modifiedFiles: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'List of relative file paths that were modified.'
              },
            },
            required: ['modifiedFiles'],
          },
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // E1 EXPERIMENT LOGGER — stderr only, does not affect JSON-RPC stream
      console.error(`[TOOL CALL] ${new Date().toISOString()} ${request.params.name} args: ${JSON.stringify(request.params.arguments)}`);
      try {
        switch (request.params.name) {
          case 'graph_query_impact': {
            const { nodeId } = request.params.arguments;
            const result = this.graphStore.getGraphQueryResult(nodeId);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          
          case 'graph_query_callers': {
            const { nodeId } = request.params.arguments;
            const callers = this.graphStore.getCallers(nodeId);
            return { content: [{ type: 'text', text: JSON.stringify(callers, null, 2) }] };
          }
          
          case 'graph_query_dependencies': {
            const { nodeId } = request.params.arguments;
            const dependencies = this.graphStore.getDependencies(nodeId);
            return { content: [{ type: 'text', text: JSON.stringify(dependencies, null, 2) }] };
          }
          
          case 'graph_query_coverage': {
            const { nodeId } = request.params.arguments;
            const coveringTests = this.graphStore.getCoverage(nodeId);
            return { content: [{ type: 'text', text: JSON.stringify(coveringTests, null, 2) }] };
          }

          case 'graph_search': {
            const { pattern } = request.params.arguments;
            const results = this.graphStore.search(pattern);
            return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
          }

          case 'graph_update_task': {
            const { modifiedFiles } = request.params.arguments;
            for (const file of modifiedFiles) {
              const absPath = path.resolve(this.root, file);
              if (fs.existsSync(absPath)) {
                await this.scanner.scanFile(absPath, this.root);
              }
            }
            await this.scanner.enrich(this.root);
            return { content: [{ type: 'text', text: `Graph updated for ${modifiedFiles.length} files.` }] };
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
    if (this.mode === 'dev') {
      console.error(`[Dev Mode] Initializing dev-graph at ${this.db.dbPath}`);
      // Index SPEC.md if it exists
      const specPath = path.join(this.root, '.dev/spec/SPEC.md');
      if (fs.existsSync(specPath)) {
        console.error(`[Dev Mode] Indexing SPEC.md...`);
        await this.scanner.scanFile(specPath, this.root);
      }
      // Index src/ if not already done or for fresh start
      console.error(`[Dev Mode] Scanning src/ directory...`);
      await this.scanner.scanDirectory(path.join(this.root, 'src'), this.root);
      console.error(`[Dev Mode] Enriching graph (LSP)...`);
      await this.scanner.enrich(this.root);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Graph MCP Server (${this.mode}) running on stdio`);
  }
}

const server = new GraphMCPServer();
server.run().catch(console.error);
