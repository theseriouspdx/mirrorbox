export type MboStage =
  | 'idle'
  | 'onboarding'
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
  stage?: MboStage;
  model?: string;
}

export interface StageTokenSnapshot {
  stage: MboStage;
  model: string;
  tokens: number;
}

export interface ModelStats {
  optimized: number;
  notOptimized: number;
  costEst: number;
  rawCostEst: number;
}

export interface RoleStats {
  tokens: number;
  costEst: number;
  rawCostEst: number;
  calls: number;
}

export interface TuiStats {
  session: {
    models: Record<string, ModelStats>;
    roles: Record<string, RoleStats>;
    cache: { hits: number; misses: number };
    toolTokens: number;
    stageHistory: StageTokenSnapshot[];
  };
  lifetime: {
    models: Record<string, ModelStats>;
    roles: Record<string, RoleStats>;
    cache: { hits: number; misses: number };
    toolTokens: number;
  };
  sessions: number;
  largestSessionDelta: number;
  lastUpdate: string;
}

export interface AppProps {
  operator: any;
  statsManager: any;
  pkg: { version: string };
  projectRoot: string;
  onSetupRequest?: () => void;
}

export const PIPELINE_STAGE_SEQUENCE: MboStage[] = [
  'classification',
  'context_pinning',
  'planning',
  'tiebreaker_plan',
  'code_derivation',
  'tiebreaker_code',
  'dry_run',
  'implement',
  'audit_gate',
  'state_sync',
  'knowledge_update',
];

export const STAGE_LABELS: Record<MboStage, string> = {
  idle: 'IDLE',
  onboarding: 'ONBOARDING',
  classification: 'CLASSIFYING',
  context_pinning: 'CHECKING ASSUMPTIONS',
  planning: 'PLANNING',
  tiebreaker_plan: 'RESOLVING PLAN',
  code_derivation: 'DERIVING CODE',
  tiebreaker_code: 'RESOLVING CODE',
  dry_run: 'DRY RUN',
  implement: 'IMPLEMENTING',
  audit_gate: 'AUDIT GATE',
  state_sync: 'SYNCING STATE',
  knowledge_update: 'UPDATING GRAPH',
  error: 'ERROR',
};

export const STAGE_ACTIONS: Record<MboStage, string> = {
  idle: 'Ready for the next instruction',
  onboarding: 'Building the working agreement',
  classification: 'Classifying the request',
  context_pinning: 'Pinning assumptions and blockers',
  planning: 'Deriving the implementation plan',
  tiebreaker_plan: 'Resolving plan disagreement',
  code_derivation: 'Deriving implementation code',
  tiebreaker_code: 'Resolving code disagreement',
  dry_run: 'Running dry-run validation',
  implement: 'Applying scoped changes',
  audit_gate: 'Waiting for audit decision',
  state_sync: 'Synchronizing state after approval',
  knowledge_update: 'Refreshing graph knowledge',
  error: 'Recovering from a pipeline error',
};

export const STAGE_COLORS: Record<MboStage, string> = {
  idle: 'magentaBright',
  onboarding: 'cyan',
  classification: 'magentaBright',
  context_pinning: 'yellow',
  planning: 'magentaBright',
  tiebreaker_plan: 'yellow',
  code_derivation: 'cyan',
  tiebreaker_code: 'yellow',
  dry_run: 'cyan',
  implement: 'cyan',
  audit_gate: 'yellow',
  state_sync: 'blue',
  knowledge_update: 'blue',
  error: 'red',
};

export const OPERATOR_PANEL_ROLES = ['operator', 'classifier', 'onboarding'];
export const PIPELINE_PANEL_ROLES = ['architecturePlanner', 'componentPlanner', 'reviewer', 'tiebreaker'];
export const EXECUTOR_PANEL_ROLES = ['executor', 'implementer', 'patchGenerator', 'dry-run', 'sandbox'];

export const PIPELINE_ROLES = new Set([
  'planner',
  'architecture-planner',
  'architectureplanner',
  'component-planner',
  'componentplanner',
  'reviewer',
  'tiebreaker',
  'tiebreaker-plan',
  'tiebreaker-code',
  'model',
  'agent',
  'classifier',
  'stage',
]);

export const EXECUTOR_ROLES = new Set([
  'executor',
  'implementer',
  'code',
  'dry-run',
  'sandbox',
]);

export const ROLE_COLORS: Record<string, string> = {
  classifier: 'magentaBright',
  stage: 'cyan',
  planner: 'blue',
  architectureplanner: 'blue',
  'architecture-planner': 'blue',
  componentplanner: 'cyan',
  'component-planner': 'cyan',
  reviewer: 'magenta',
  tiebreaker: 'yellow',
  executor: 'green',
  implementer: 'green',
  operator: 'white',
  model: 'cyan',
  default: 'white',
};
