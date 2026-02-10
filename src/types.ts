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
  workflow: WorkflowType;
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

export type WorkflowType = "feature-dev" | "bug-fix" | "security-audit";

export interface WorkflowPipeline {
  name: WorkflowType;
  description: string;
  steps: PipelineStep[];
}

export interface PipelineStep {
  agent: string;
  role: "plan" | "implement" | "verify" | "test" | "review" | "triage" | "investigate" | "scan" | "fix" | "compound";
  loop?: boolean;
  verifyEach?: boolean;
}

export interface AgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  allowedTools: string[];
  resources: string[];
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
