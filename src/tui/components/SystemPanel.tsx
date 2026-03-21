import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'module';
import { C } from '../colors.js';
const require = createRequire(import.meta.url);

interface McpInfo { port: number | null; healthy: boolean; projectId: string | null; timestamp: string | null }
interface Props { projectRoot: string; isActive: boolean }

function readMcpInfo(projectRoot: string): McpInfo {
  const fs = require('fs');
  const path = require('path');
  for (const rel of ['.dev/run/mcp.json', '.mbo/run/mcp.json']) {
    const p = path.join(projectRoot, rel);
    try {
      if (fs.existsSync(p)) {
        const m = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (m && m.port) return { port: m.port, healthy: false, projectId: m.project_id ?? null, timestamp: m.timestamp ?? null };
      }
    } catch { /* skip */ }
  }
  return { port: null, healthy: false, projectId: null, timestamp: null };
}

function readLocalConfig(projectRoot: string): Record<string, any> {
  const fs = require('fs'), path = require('path'), os = require('os');
  let config: Record<string, any> = {};
  try {
    const p = path.join(projectRoot, '.mbo', 'config.json');
    if (fs.existsSync(p)) config = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* skip */ }

  // Merge with global operator config for routing map (Section 35.4)
  try {
    const gp = path.join(os.homedir(), '.mbo', 'config.json');
    if (fs.existsSync(gp)) {
      const g = JSON.parse(fs.readFileSync(gp, 'utf8'));
      config = { ...config, ...g };
    }
  } catch { /* skip */ }
  return config;
}

export function SystemPanel({ projectRoot, isActive }: Props) {
  const [mcpInfo, setMcpInfo] = useState<McpInfo>({ port: null, healthy: false, projectId: null, timestamp: null });
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

  const borderColor = isActive ? C.teal : C.purple;
  const mcpColor = mcpInfo.port ? (mcpInfo.healthy ? 'green' : 'yellow') : 'red';
  const mcpStatus = mcpInfo.port ? (mcpInfo.healthy ? `● HEALTHY :${mcpInfo.port}` : `◌ STARTING :${mcpInfo.port}`) : '✗ NOT RUNNING';
  const uptime = mcpInfo.timestamp ? Math.floor((Date.now() - Date.parse(mcpInfo.timestamp)) / 60000) : null;
  const clients = (config.mcpClients ?? []).map((c: any) => c.name).join(', ') || 'none';

  // Extract routing assignments
  const roles = ['classifier', 'operator', 'planner', 'reviewer', 'tiebreaker'];
  const routes = roles.map(r => {
    const c = config[r];
    if (!c) return null;
    const model = c.model || c.cli || 'unknown';
    return { role: r, model };
  }).filter(Boolean);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}SYSTEM — MCP · Graph · Config</Text>
      <Box flexDirection="column" marginTop={1} gap={0}>
        <Text color="white" dimColor>── MCP Daemon ───────────────────────────</Text>
        <Box justifyContent="space-between">
          <Text color={mcpColor}> {mcpStatus}</Text>
          {uptime !== null && <Text color="white" dimColor>uptime: {uptime}m </Text>}
        </Box>
        {mcpInfo.projectId && <Text color="white" dimColor>  project_id: {mcpInfo.projectId}</Text>}
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── Model Routing ────────────────────────</Text>
        {routes.length === 0 ? (
          <Text color="white">  (auto-detected)</Text>
        ) : (
          routes.map(r => (
            <Text key={r!.role} color="white">
              {'  ' + r!.role.padEnd(12)} <Text color="cyan">{r!.model}</Text>
            </Text>
          ))
        )}
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── MCP Clients ──────────────────────────</Text>
        <Text color="white">  {clients}</Text>
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── Project ──────────────────────────────</Text>
        <Text color="white">  {projectRoot}</Text>
        <Text color="white" dimColor> </Text>
        <Text color="white" dimColor>── Commands ─────────────────────────────</Text>
        <Text color="white" dimColor>  mbo mcp   — restart MCP daemon</Text>
        <Text color="white" dimColor>  mbo setup — re-run setup wizard</Text>
      </Box>
    </Box>
  );
}
