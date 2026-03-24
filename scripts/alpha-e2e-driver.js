#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const WORKFLOW_PROMPT = 'Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.';
const DEFAULT_TIMEOUT_MS = Number(process.env.MBO_E2E_DRIVER_TIMEOUT_MS || 180000);
const ASSUMPTION_GUIDANCE_MODEL = 'google/gemini-2.0-flash-001';

function parseArgs(argv) {
  const out = {
    alphaRoot: '',
    alphaLog: '',
    mirrorLog: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--alpha-root') out.alphaRoot = argv[i + 1] || '';
    if (arg === '--alpha-log') out.alphaLog = argv[i + 1] || '';
    if (arg === '--mirror-log') out.mirrorLog = argv[i + 1] || '';
    if (arg === '--timeout-ms') out.timeoutMs = Number(argv[i + 1] || out.timeoutMs);
    if (arg.startsWith('--')) i += 1;
  }

  if (!out.alphaRoot || !out.alphaLog || !out.mirrorLog) {
    throw new Error('Usage: node scripts/alpha-e2e-driver.js --alpha-root <path> --alpha-log <path> --mirror-log <path> [--timeout-ms <ms>]');
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000) {
    throw new Error(`Invalid --timeout-ms value: ${out.timeoutMs}`);
  }

  return out;
}

function stripAnsi(text) {
  return String(text)
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '\n');
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sanitizeSingleLine(text, maxLength = 180) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/^pin:\s*/i, '')
    .trim()
    .slice(0, maxLength);
}

function buildAssumptionGuidancePrompt(transcript) {
  const tail = String(transcript || '').slice(-12000);
  return [
    'You are advising an automated MBO E2E operator session.',
    'Return exactly one short plain-text line suitable for a `pin:` command.',
    'Constraints: preserve the read-only workflow, prefer the minimal audit-ready path, do not request file edits, and keep it under 160 characters.',
    'If there is no clear assumption risk, still return one conservative steering line.',
    '',
    'Transcript excerpt:',
    tail,
  ].join('\n');
}

function deriveAssumptionGuidance(transcript) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  const apiBase = String(process.env.OPENAI_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY or OPENROUTER_API_KEY for Gemini Flash guidance');
  }

  const payload = JSON.stringify({
    model: ASSUMPTION_GUIDANCE_MODEL,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'You produce concise execution guidance for an automated MBO workflow script. Output plain text only.',
      },
      {
        role: 'user',
        content: buildAssumptionGuidancePrompt(transcript),
      },
    ],
  });

  const response = spawnSync('curl', [
    '-sS',
    '-X', 'POST',
    `${apiBase}/chat/completions`,
    '-H', 'Content-Type: application/json',
    '-H', `Authorization: Bearer ${apiKey}`,
    '-H', 'HTTP-Referer: https://mbo.local/alpha-e2e',
    '-H', 'X-Title: MBO Alpha E2E',
    '--data-binary', payload,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });

  if (response.status !== 0) {
    throw new Error(response.stderr || `curl exited ${response.status}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(response.stdout || '{}');
  } catch (err) {
    throw new Error(`Invalid curl JSON: ${err.message}`);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  const guidance = Array.isArray(content)
    ? content.map((part) => part?.text || '').join(' ')
    : content;
  const line = sanitizeSingleLine(guidance, 160);
  if (!line) {
    throw new Error('Gemini Flash guidance response was empty');
  }
  return line;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[alpha-runtime] ${err.message}`);
    process.exit(2);
  }

  ensureParent(args.alphaLog);
  ensureParent(args.mirrorLog);

  const alphaStream = fs.createWriteStream(args.alphaLog, { flags: 'a' });
  const mirrorStream = fs.createWriteStream(args.mirrorLog, { flags: 'a' });
  const logStreams = [alphaStream, mirrorStream];

  const child = spawn('npx', ['mbo', 'cl'], {
    cwd: args.alphaRoot,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let cleanBuffer = '';
  let phase = 'await_boot';
  let success = false;
  let settled = false;
  let guidanceIssued = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    console.error(`[alpha-runtime] Timed out waiting for E2E completion during phase: ${phase}`);
    child.kill('SIGTERM');
    finalize(1);
  }, args.timeoutMs);

  function writeLogs(chunk, target) {
    target.write(chunk);
    for (const stream of logStreams) stream.write(chunk);
    cleanBuffer = (cleanBuffer + stripAnsi(chunk)).slice(-200000);
    drive();
  }

  function writeControlLine(line) {
    const text = `${String(line).trim()}\n`;
    process.stdout.write(text);
    for (const stream of logStreams) stream.write(text);
    cleanBuffer = (cleanBuffer + stripAnsi(text)).slice(-200000);
  }

  function sendLine(line) {
    if (settled || !child.stdin.writable) return;
    child.stdin.write(`${line}\n`);
  }

  function drive() {
    if (settled) return;

    if (phase === 'await_boot' && (cleanBuffer.includes('MBO Engine v') || cleanBuffer.includes('MBO v'))) {
      sendLine('status');
      phase = 'await_status';
      return;
    }

    if (phase === 'await_status' && cleanBuffer.includes('Hints:')) {
      sendLine(WORKFLOW_PROMPT);
      phase = 'await_go';
      return;
    }

    if (
      phase === 'await_go' &&
      (cleanBuffer.includes('Spec refinement gate:') ||
        cleanBuffer.includes("Type 'pin: [id]' to emphasize, 'exclude: [id]' to ignore, or 'go' to proceed."))
    ) {
      if (!guidanceIssued) {
        try {
          const guidance = deriveAssumptionGuidance(cleanBuffer);
          writeControlLine(`[ASSUMPTION GUIDE] source=curl model=${ASSUMPTION_GUIDANCE_MODEL} text=${guidance}`);
          sendLine(`pin: ${guidance}`);
        } catch (err) {
          const fallback = 'Preserve the read-only path and choose the smallest audit-ready workflow that reaches approval cleanly.';
          writeControlLine(`[ASSUMPTION GUIDE] source=fallback error=${sanitizeSingleLine(err.message, 220)} text=${fallback}`);
          sendLine(`pin: ${fallback}`);
        }
        guidanceIssued = true;
        phase = 'await_go_after_guidance';
        return;
      }
      sendLine('go');
      phase = 'await_approved';
      return;
    }

    if (
      phase === 'await_go_after_guidance' &&
      (cleanBuffer.includes('Queued hint for planning.') || cleanBuffer.includes('Spec refinement updated.'))
    ) {
      sendLine('go');
      phase = 'await_approved';
      return;
    }

    if (phase === 'await_approved' && cleanBuffer.includes('Audit package ready. Respond "approved"')) {
      sendLine('approved');
      phase = 'await_idle_ack';
      return;
    }

    if (phase === 'await_idle_ack' && cleanBuffer.includes('[AUDIT] Approved. State synced. Intelligence graph updated.')) {
      sendLine('status');
      phase = 'await_idle_status';
      return;
    }

    if (phase === 'await_idle_status' && cleanBuffer.includes('Status: Idle')) {
      success = true;
      phase = 'done';
      child.stdin.end();
    }
  }

  function finalize(code) {
    if (settled && code !== 1) return;
    settled = true;
    clearTimeout(timeout);
    alphaStream.end();
    mirrorStream.end();
    process.exit(code);
  }

  child.stdout.on('data', (chunk) => writeLogs(chunk, process.stdout));
  child.stderr.on('data', (chunk) => writeLogs(chunk, process.stderr));

  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    console.error(`[alpha-runtime] Failed to launch mbo: ${err.message}`);
    finalize(1);
  });

  child.on('close', (code, signal) => {
    if (settled) return;
    if (!success) {
      console.error(`[alpha-runtime] E2E session ended before reaching final idle state. phase=${phase} code=${code ?? 'null'} signal=${signal || 'none'}`);
      finalize(1);
      return;
    }
    finalize(code === 0 ? 0 : 1);
  });
}

main();
