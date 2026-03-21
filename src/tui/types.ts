export type MboStage =
  | 'idle'
  | 'classification'
  | 'context_pinning'
  | 'planning'
  | 'tiebreaker_plan'
  | 'code_derivation'
  | 'tiebreaker_code'
  | 'dry_run'
  | 'implement'
  | 'audit_gate'
  | 'state_sync'
  | 'knowledge_update'
  | 'error';

export type ActiveTab = 1 | 2 | 3 | 4;

export interface PipelineEntry {
  id: string;
  role: string;
  text: string;
}

export interface ModelStats {
  optimized: number;
  notOptimized: number;
  costEst: number;
  rawCostEst: number;
}

export interface TuiStats {
  session: { models: Record<string, ModelStats>; cache: { hits: number; misses: number }; toolTokens: number };
  lifetime: { models: Record<string, ModelStats>; cache: { hits: number; misses: number }; toolTokens: number };
  sessions: number;
  largestSessionDelta: number;
  lastUpdate: string;
}

export interface AppProps {
  operator: any;
  statsManager: any;
  pkg: { version: string };
  projectRoot: string;
}

export const STAGE_LABELS: Record<MboStage, string> = {
  idle:             'IDLE',
  classification:   'CLASSIFYING',
  context_pinning:  'CHECKING ASSUMPTIONS',
  planning:         'PLANNING',
  tiebreaker_plan:  'RESOLVING PLAN',
  code_derivation:  'DERIVING CODE',
  tiebreaker_code:  'RESOLVING CODE',
  dry_run:          'DRY RUN',
  implement:        'IMPLEMENTING',
  audit_gate:       'AUDIT GATE',
  state_sync:       'SYNCING STATE',
  knowledge_update: 'UPDATING GRAPH',
  error:            'ERROR',
};

export const STAGE_COLORS: Record<MboStage, string> = {
  idle:             'magentaBright',
  classification:   'magentaBright',
  context_pinning:  'yellow',
  planning:         'magentaBright',
  tiebreaker_plan:  'yellow',
  code_derivation:  'cyan',
  tiebreaker_code:  'yellow',
  dry_run:          'cyan',
  implement:        'cyan',
  audit_gate:       'yellow',
  state_sync:       'blue',
  knowledge_update: 'blue',
  error:            'red',
};

// Roles that stream to the Pipeline tab
export const PIPELINE_ROLES = new Set([
  'planner', 'architecture-planner', 'component-planner',
  'reviewer', 'tiebreaker', 'tiebreaker-plan', 'tiebreaker-code',
  'model', 'agent',
]);

// Roles that stream to the Executor tab
export const EXECUTOR_ROLES = new Set([
  'executor', 'implementer', 'code', 'dry-run', 'sandbox',
]);

export const ROLE_COLORS: Record<string, string> = {
  planner:              'blue',
  'architecture-planner': 'blue',
  'component-planner':  'cyan',
  reviewer:             'magenta',
  tiebreaker:           'yellow',
  executor:             'green',
  implementer:          'green',
  operator:             'white',
  model:                'cyan',
  default:              'white',
};
