/**
 * Configuration loading — spool.yaml, agent definitions, workflow formulas.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { parseYaml } from "./core/yaml.js";
import type { SpoolConfig, AgentDefinition, WorkflowFormula, WorkflowStep } from "./core/types.js";
import { DEFAULT_SPOOL_CONFIG } from "./core/types.js";

/**
 * Load spool.yaml from the project root.
 * Returns defaults if the file doesn't exist.
 */
export function loadConfig(projectDir: string): SpoolConfig {
  const configPath = join(projectDir, "spool.yaml");
  if (!existsSync(configPath)) {
    return { ...DEFAULT_SPOOL_CONFIG };
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) as Partial<SpoolConfig> | null;
  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_SPOOL_CONFIG };
  }

  return {
    ...DEFAULT_SPOOL_CONFIG,
    ...parsed,
    loop: { ...DEFAULT_SPOOL_CONFIG.loop, ...parsed.loop },
    learnings: { ...DEFAULT_SPOOL_CONFIG.learnings, ...parsed.learnings },
  };
}

/**
 * Load a single agent definition from .spool/agents/<name>.yaml
 */
export function loadAgent(spoolDir: string, name: string): AgentDefinition {
  const agentPath = join(spoolDir, "agents", `${name}.yaml`);
  if (!existsSync(agentPath)) {
    throw new Error(`Agent not found: ${agentPath}`);
  }

  const raw = readFileSync(agentPath, "utf-8");
  const parsed = parseYaml(raw) as Record<string, unknown> | null;
  if (!parsed) {
    throw new Error(`Failed to parse agent: ${name}`);
  }

  return {
    name: String(parsed.name || name),
    description: String(parsed.description || ""),
    prompt: String(parsed.prompt || ""),
    context: Array.isArray(parsed.context) ? parsed.context.map(String) : [],
    output: parsed.output ? {
      format: String((parsed.output as Record<string, unknown>).format || "text") as "json" | "markdown" | "text",
      path: (parsed.output as Record<string, unknown>).path ? String((parsed.output as Record<string, unknown>).path) : undefined,
      schema: (parsed.output as Record<string, unknown>).schema ? String((parsed.output as Record<string, unknown>).schema) : undefined,
    } : undefined,
  };
}

/**
 * Load a workflow formula from .spool/workflows/<name>.yaml
 */
export function loadWorkflow(spoolDir: string, name: string): WorkflowFormula {
  const workflowPath = join(spoolDir, "workflows", `${name}.yaml`);
  if (!existsSync(workflowPath)) {
    throw new Error(`Workflow not found: ${workflowPath}`);
  }

  const raw = readFileSync(workflowPath, "utf-8");
  const parsed = parseYaml(raw) as Record<string, unknown> | null;
  if (!parsed) {
    throw new Error(`Failed to parse workflow: ${name}`);
  }

  const rawSteps = parsed.steps as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rawSteps)) {
    throw new Error(`Workflow ${name} has no steps`);
  }

  const steps: WorkflowStep[] = rawSteps.map(s => ({
    id: String(s.id),
    agent: String(s.agent),
    description: s.description ? String(s.description) : undefined,
    needs: Array.isArray(s.needs) ? s.needs.map(String) : undefined,
    for_each: s.for_each ? String(s.for_each) : undefined,
    verifier: s.verifier ? String(s.verifier) : undefined,
    max_retries: typeof s.max_retries === "number" ? s.max_retries : undefined,
    always: s.always === true ? true : undefined,
  }));

  return {
    name: String(parsed.name || name),
    description: String(parsed.description || ""),
    vars: parsed.vars as Record<string, { description: string; required?: boolean; default?: string }> | undefined,
    steps,
  };
}

/**
 * Discover available agent names from .spool/agents/
 */
export function discoverAgents(spoolDir: string): string[] {
  const agentsDir = join(spoolDir, "agents");
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter(f => f.endsWith(".yaml"))
    .map(f => f.replace(/\.yaml$/, ""));
}

/**
 * Discover available workflow names from .spool/workflows/
 */
export function discoverWorkflows(spoolDir: string): string[] {
  const workflowsDir = join(spoolDir, "workflows");
  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir)
    .filter(f => f.endsWith(".yaml"))
    .map(f => f.replace(/\.yaml$/, ""));
}
