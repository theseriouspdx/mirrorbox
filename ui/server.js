#!/usr/bin/env node
'use strict';
/**
 * MBO UI Bridge Server
 * ─────────────────────────────────────────────────────────────
 * • Spawns and manages the MBO subprocess (stdin/stdout bridge)
 * • Parses live output: stages, agent roles, audit gates, spinner
 * • WebSocket API for real-time streaming to the browser
 * • REST API: /api/stats, /api/tasks, /api/bugs, /api/events,
 *             /api/mcp, /api/session, /api/providers
 * • Serves index.html at /
 * ─────────────────────────────────────────────────────────────
 */

const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const crypto    = require('crypto');

// ── Config ────────────────────────────────────────────────────
const PORT         = parseInt(process.env.MBO_UI_PORT  || '7891', 10);
const MBO_ROOT     = path.resolve(__dirname, '..');
const UI_DIR       = __dirname;
const DEFAULT_PROJECT = process.env.MBO_PROJECT
  || '/Users/johnserious/MBO_Alpha';

// ── State ─────────────────────────────────────────────────────
let mboProcess    = null;
let mboRunning    = false;
let projectDir    = DEFAULT_PROJECT;
let pipelineRunning = false;
let currentStage  = 'idle';
let auditPending  = false;
let lastPromptAt  = 0;
let outputBuffer  = '';          // raw byte accumulator
let clients       = new Set();   // connected WebSocket clients

const STAGE_LABELS = {
  classification:   'Classifying request',
  context_pinning:  'Checking assumptions',
  planning:         'Deriving plan',
  tiebreaker_plan:  'Resolving plan conflict',
  code_derivation:  'Deriving code',
  tiebreaker_code:  'Resolving code conflict',
  dry_run:          'Running dry run',
  implement:        'Applying changes',
  audit_gate:       'Awaiting audit decision',
  state_sync:       'Syncing state',
  knowledge_update: 'Updating graph',
  idle:             'Idle',
  working:          'Working',
};

