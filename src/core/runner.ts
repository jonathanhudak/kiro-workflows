/**
 * Runner — the public interface for executing agents.
 *
 * Loads agent definitions, resolves steering context via SteeringManager,
 * and delegates execution to the configured adapter.
 */

import { join } from "path";
import type { Adapter, AgentDefinition, ExecutionContext, AgentResult, SpoolConfig } from "./types.js";
import { loadAgent } from "../config.js";
import { SteeringManager } from "./steering.js";
import { LearningsManager } from "./learnings.js";

export class Runner {
  private adapter: Adapter;
  private config: SpoolConfig;
  private steeringManagers = new Map<string, SteeringManager>();

  constructor(adapter: Adapter, config: SpoolConfig) {
    this.adapter = adapter;
    this.config = config;
  }

  /**
   * Run a named agent with a prompt. Returns the agent's output text.
   * Each call is a fresh session — no memory carried over.
   */
  async runAgent(
    agentName: string,
    prompt: string,
    projectDir: string,
    opts: { runId?: string; stepId?: string; vars?: Record<string, string>; feedback?: string } = {}
  ): Promise<string> {
    const spoolDir = join(projectDir, ".spool");
    const agent = loadAgent(spoolDir, agentName);
    const steering = this.getSteeringManager(spoolDir);
    const steeringContent = steering.resolve(agent);

    const context: ExecutionContext = {
      prompt,
      projectDir,
      spoolDir,
      runId: opts.runId || "manual",
      stepId: opts.stepId || agentName,
      vars: opts.vars || {},
      steeringContent,
      feedback: opts.feedback,
      timeout: this.config.adapters?.[this.adapter.name]?.timeout,
    };

    const result = await this.adapter.exec(agent, context);
    return result.output;
  }

  /**
   * Run an agent with a pre-loaded definition.
   */
  async runWithDefinition(
    agent: AgentDefinition,
    prompt: string,
    projectDir: string,
    opts: { runId?: string; stepId?: string; vars?: Record<string, string>; feedback?: string } = {}
  ): Promise<AgentResult> {
    const spoolDir = join(projectDir, ".spool");
    const steering = this.getSteeringManager(spoolDir);
    const steeringContent = steering.resolve(agent);

    const context: ExecutionContext = {
      prompt,
      projectDir,
      spoolDir,
      runId: opts.runId || "manual",
      stepId: opts.stepId || agent.name,
      vars: opts.vars || {},
      steeringContent,
      feedback: opts.feedback,
      timeout: this.config.adapters?.[this.adapter.name]?.timeout,
    };

    return this.adapter.exec(agent, context);
  }

  /**
   * Clean up adapter resources (e.g., persistent processes).
   */
  async cleanup(): Promise<void> {
    await this.adapter.cleanup?.();
  }

  /**
   * Lazily create a SteeringManager per spoolDir (typically one).
   */
  private getSteeringManager(spoolDir: string): SteeringManager {
    let mgr = this.steeringManagers.get(spoolDir);
    if (!mgr) {
      const learnings = new LearningsManager(spoolDir, this.config.learnings || {});
      mgr = new SteeringManager(spoolDir, learnings);
      this.steeringManagers.set(spoolDir, mgr);
    }
    return mgr;
  }
}
