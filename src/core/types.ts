/**
 * Core types for the spool orchestration system.
 * Provider-agnostic — no adapter-specific details here.
 */

// ─── Agent Definition (loaded from .spool/agents/*.yaml) ────────────────────

export interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  context: string[];
  output?: OutputSpec;
}

export interface OutputSpec {
  format: "json" | "markdown" | "text";
  path?: string;
  schema?: string;
}

// ─── Workflow Formula (loaded from .spool/workflows/*.yaml) ─────────────────

export interface WorkflowFormula {
  name: string;
  description: string;
  vars?: Record<string, VarDef>;
  steps: WorkflowStep[];
}

export interface VarDef {
  description: string;
  required?: boolean;
  default?: string;
}

export interface WorkflowStep {
  id: string;
  agent: string;
  description?: string;
  needs?: string[];
  for_each?: string;
  verifier?: string;
  max_retries?: number;
  always?: boolean;
}

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface Adapter {
  name: string;
  validate(): Promise<AdapterStatus>;
  exec(agent: AgentDefinition, context: ExecutionContext): Promise<AgentResult>;
  cleanup?(): Promise<void>;
}

export interface AdapterStatus {
  installed: boolean;
  version?: string;
  error?: string;
}

export interface ExecutionContext {
  prompt: string;
  projectDir: string;
  spoolDir: string;
  runId: string;
  stepId: string;
  vars: Record<string, string>;
  steeringContent?: Record<string, string>;
  feedback?: string;
  timeout?: number;
}

export interface AgentResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

// ─── Task Ledger ────────────────────────────────────────────────────────────

export type LedgerEvent =
  | { type: "run_start"; runId: string; workflow: string; adapter: string; task: string; timestamp: string }
  | { type: "run_complete"; runId: string; workflow: string; status: "pass" | "fail"; timestamp: string }
  | { type: "step_start"; runId: string; step: string; agent: string; timestamp: string }
  | { type: "step_complete"; runId: string; step: string; status: "pass" | "fail" | "skip"; durationMs: number; timestamp: string }
  | { type: "loop_start"; runId: string; step: string; storyId: string; attempt: number; timestamp: string }
  | { type: "loop_pass"; runId: string; step: string; storyId: string; attempt: number; timestamp: string }
  | { type: "loop_fail"; runId: string; step: string; storyId: string; attempt: number; feedback: string; timestamp: string }
  | { type: "loop_exhausted"; runId: string; step: string; storyId: string; attempts: number; timestamp: string }
  | { type: "learning"; runId: string; content: string; timestamp: string };

// ─── Project Configuration (spool.yaml) ─────────────────────────────────────

export interface SpoolConfig {
  version?: number;
  adapter: string;
  adapters?: Record<string, AdapterConfig>;
  loop?: LoopConfig;
  learnings?: LearningsConfig;
}

export interface AdapterConfig {
  command?: string;
  args?: string[];
  timeout?: number;
  env?: Record<string, string>;
}

export interface LoopConfig {
  max_retries?: number;
  retry_delay?: number;
}

export interface LearningsConfig {
  auto?: boolean;
  inject?: boolean;
}

export const DEFAULT_SPOOL_CONFIG: SpoolConfig = {
  version: 1,
  adapter: "claude-code",
  loop: {
    max_retries: 3,
    retry_delay: 0,
  },
  learnings: {
    auto: true,
    inject: true,
  },
};

// ─── Runtime Types (workflow execution) ──────────────────────────────────────

export type StoryStatus = "pending" | "running" | "done" | "failed";

export interface Story {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: StoryStatus;
  output?: string;
  retryCount: number;
  maxRetries: number;
  verifyFeedback?: string;
}

export interface WorkflowRun {
  id: string;
  workflow: string;
  task: string;
  status: "planning" | "running" | "verifying" | "done" | "failed";
  stories: Story[];
  branch: string;
  progress: string[];
  learnings: string[];
  createdAt: string;
  updatedAt: string;
  iteration: number;
  maxIterations: number;
}

export interface RunConfig {
  maxIterations: number;
  maxRetries: number;
  verifyEach: boolean;
  useAcp: boolean;
  verbose: boolean;
  projectDir: string;
}

export const DEFAULT_CONFIG: RunConfig = {
  maxIterations: 15,
  maxRetries: 3,
  verifyEach: true,
  useAcp: false,
  verbose: false,
  projectDir: process.cwd(),
};
