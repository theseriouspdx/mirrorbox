import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'module';
import { C } from '../colors.js';

const require = createRequire(import.meta.url);

interface McpInfo {
  port: number | null;
  healthy: boolean;
  projectId: string | null;
  timestamp: string | null;
}

interface Props {
  projectRoot: string;
  isActive: boolean;
}

function readMcpInfo(projectRoot: string): McpInfo {
  const fs = require('fs');
  const path = require('path');
  for (const rel of ['.dev/run/mcp.json', '.mbo/run/mcp.json']) {
    const target = path.join(projectRoot, rel);
    try {
      if (fs.existsSync(target)) {
        const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (parsed && parsed.port) {
          return {
            port: parsed.port,
            healthy: false,
            projectId: parsed.project_id ?? null,
            timestamp: parsed.timestamp ?? null,
          };
        }
      }
    } catch {
      // ignore malformed manifest
    }
  }
  return { port: null, healthy: false, projectId: null, timestamp: null };
}

function readConfig(projectRoot: string): Record<string, any> {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  let config: Record<string, any> = {};

  try {
    const localPath = path.join(projectRoot, '.mbo', 'config.json');
    if (fs.existsSync(localPath)) config = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch {
    // ignore local config failure
  }

  try {
    const globalPath = path.join(os.homedir(), '.mbo', 'config.json');
    if (fs.existsSync(globalPath)) {
      const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
      config = { ...config, ...parsed };
    }
  } catch {
    // ignore global config failure
  }

  return config;
}

function summarizeModel(entry: any): string {
  if (!entry) return 'unassigned';
  if (entry.model) return entry.model;
  if (entry.cli) return entry.cli;
  return 'unknown';
}

export function SystemPanel({ projectRoot, isActive }: Props) {
  const [mcpInfo, setMcpInfo] = useState<McpInfo>({ port: null, healthy: false, projectId: null, timestamp: null });
  const [config, setConfig] = useState<Record<string, any>>({});
  const [tick, setTick] = useState(0);
  const http = require('http');

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const info = readMcpInfo(projectRoot);
    setMcpInfo(info);
    setConfig(readConfig(projectRoot));

    if (!info.port) return;

    const req = http.get('http://127.0.0.1:' + info.port + '/health', { timeout: 2000 }, (res: any) => {
      let body = '';
      res.on('data', (chunk: any) => {
        body += chunk;
      });
      res.on('end', () => {
        setMcpInfo((prev) => ({ ...prev, healthy: body.includes('"status":"ok"') }));
      });
    });
    req.on('error', () => setMcpInfo((prev) => ({ ...prev, healthy: false })));
    req.on('timeout', () => req.destroy());
  }, [tick, projectRoot]);

  const borderColor = isActive ? C.teal : C.purple;
  const mcpColor = mcpInfo.port ? (mcpInfo.healthy ? 'green' : 'yellow') : C.error;
  const mcpStatus = mcpInfo.port
    ? (mcpInfo.healthy ? 'HEALTHY :' + mcpInfo.port : 'STARTING :' + mcpInfo.port)
    : 'NOT RUNNING';
  const uptime = mcpInfo.timestamp ? Math.floor((Date.now() - Date.parse(mcpInfo.timestamp)) / 60000) : null;
  const clients = (config.mcpClients ?? []).map((client: any) => client.name).join(', ') || 'none';
  const routes = [
    { role: 'classifier', model: summarizeModel(config.classifier) },
    { role: 'operator', model: summarizeModel(config.operator) },
    { role: 'planner-a', model: summarizeModel(config.architecturePlanner || config.planner) },
    { role: 'planner-b', model: summarizeModel(config.componentPlanner || config.planner) },
    { role: 'reviewer', model: summarizeModel(config.reviewer) },
    { role: 'tiebreaker', model: summarizeModel(config.tiebreaker) },
  ];

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}SYSTEM</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={C.gray} dimColor>── MCP Daemon</Text>
        <Box justifyContent="space-between">
          <Text color={mcpColor}>{mcpStatus}</Text>
          {uptime !== null ? <Text color={C.gray} dimColor>uptime: {uptime}m</Text> : null}
        </Box>
        {mcpInfo.projectId ? <Text color={C.gray} dimColor>project_id: {mcpInfo.projectId}</Text> : null}

        <Text color={C.gray} dimColor> </Text>
        <Text color={C.gray} dimColor>── Pipeline Routing</Text>
        {routes.map((route) => (
          <Text key={route.role} color={C.white}>
            {route.role.padEnd(12)} <Text color={C.teal}>{route.model}</Text>
          </Text>
        ))}

        <Text color={C.gray} dimColor> </Text>
        <Text color={C.gray} dimColor>── Setup / Commands</Text>
        <Text color={C.white}>/setup<Text color={C.gray} dimColor> re-run model chooser and setup flow</Text></Text>
        <Text color={C.white}>/docs<Text color={C.gray} dimColor> open governance docs in the TUI</Text></Text>
        <Text color={C.white}>/tasks<Text color={C.gray} dimColor> open task navigator</Text></Text>

        <Text color={C.gray} dimColor> </Text>
        <Text color={C.gray} dimColor>── Clients</Text>
        <Text color={C.white}>{clients}</Text>

        <Text color={C.gray} dimColor> </Text>
        <Text color={C.gray} dimColor>── Project</Text>
        <Text color={C.white}>{projectRoot}</Text>
      </Box>
    </Box>
  );
}
