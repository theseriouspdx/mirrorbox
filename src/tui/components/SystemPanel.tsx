import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

interface McpInfo { port: number | null; healthy: boolean; projectId: string | null }
interface Props { projectRoot: string; isActive: boolean }

function readMcpInfo(projectRoot: string): McpInfo {
  const fs = require('fs');
  const path = require('path');
  const http = require('http');
  for (const rel of ['.dev/run/mcp.json', '.mbo/run/mcp.json']) {
    const p = path.join(projectRoot, rel);
    try {
      if (fs.existsSync(p)) {
        const m = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (m && m.port) return { port: m.port, healthy: false, projectId: m.project_id ?? null };
      }
    } catch { /* skip */ }
  }
  return { port: null, healthy: false, projectId: null };
}

function readLocalConfig(projectRoot: string): Record<string, any> {
  const fs = require('fs'), path = require('path');
  try {
    const p = path.join(projectRoot, '.mbo', 'config.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* skip */ }
  return {};
}

export function SystemPanel({ projectRoot, isActive }: Props) {
  const [mcpInfo, setMcpInfo] = useState<McpInfo>({ port: null, healthy: false, projectId: null });
  const [config, setConfig] = useState<Record<string, any>>({});
  const [tick, setTick] = useState(0);
  const http = require('http');

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const info = readMcpInfo(projectRoot);
    setMcpInfo(info);
    setConfig(readLocalConfig(projectRoot));
    if (info.port) {
      const req = http.get(`http://127.0.0.1:${info.port}/health`, { timeout: 2000 }, (res: any) => {
        let body = '';
        res.on('data', (d: any) => (body += d));
        res.on('end', () => setMcpInfo((prev) => ({ ...prev, healthy: body.includes('"status":"ok"') })));
      });
      req.on('error', () => setMcpInfo((prev) => ({ ...prev, healthy: false })));
      req.on('timeout', () => { req.destroy(); });
    }
  }, [tick, projectRoot]);

  const borderColor = isActive ? 'cyan' : 'blue';
  const mcpColor = mcpInfo.port ? (mcpInfo.healthy ? 'green' : 'yellow') : 'red';
  const mcpStatus = mcpInfo.port ? (mcpInfo.healthy ? `● HEALTHY :${mcpInfo.port}` : `◌ STARTING :${mcpInfo.port}`) : '✗ NOT RUNNING';
  const clients = (config.mcpClients ?? []).map((c: any) => c.name).join(', ') || 'none';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}SYSTEM — MCP · Graph · Config</Text>
      <Box flexDirection="column" marginTop={1} gap={0}>
        <Text color="white" dimColor>── MCP Daemon ───────────────────────────</Text>
        <Text color={mcpColor}> {mcpStatus}</Text>
        {mcpInfo.projectId && <Text color="white" dimColor>  project_id: {mcpInfo.projectId}</Text>}
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── Project ──────────────────────────────</Text>
        <Text color="white">  {projectRoot}</Text>
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── MCP Clients ──────────────────────────</Text>
        <Text color="white">  {clients}</Text>
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── Commands ─────────────────────────────</Text>
        <Text color="white" dimColor>  mbo mcp   — restart MCP daemon</Text>
        <Text color="white" dimColor>  mbo setup — re-run setup wizard</Text>
        <Text color="white" dimColor>  mbo auth  — manage auth sessions</Text>
      </Box>
    </Box>
  );
}
