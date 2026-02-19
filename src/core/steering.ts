/**
 * SteeringManager — resolves and assembles steering context for agents.
 *
 * Reads files from .spool/steering/ referenced by agent definitions,
 * and optionally injects learnings content.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { AgentDefinition } from "./types.js";
import { LearningsManager } from "./learnings.js";

export class SteeringManager {
  private spoolDir: string;
  private learnings: LearningsManager;

  constructor(spoolDir: string, learnings: LearningsManager) {
    this.spoolDir = spoolDir;
    this.learnings = learnings;
  }

  /**
   * Resolve all steering content for an agent.
   * Returns a map of context-path → file-content.
   * Includes learnings if injection is enabled.
   */
  resolve(agent: AgentDefinition): Record<string, string> {
    const content: Record<string, string> = {};

    // Resolve explicit context references
    for (const contextPath of agent.context) {
      const fullPath = join(this.spoolDir, contextPath);
      if (existsSync(fullPath)) {
        content[contextPath] = readFileSync(fullPath, "utf-8");
      }
    }

    // Inject learnings if enabled
    const learningsContent = this.learnings.getInjectable();
    if (learningsContent) {
      content["steering/learnings.md"] = learningsContent;
    }

    return content;
  }

  /** List all steering files in .spool/steering/. */
  list(): string[] {
    const steeringDir = join(this.spoolDir, "steering");
    if (!existsSync(steeringDir)) return [];
    return readdirSync(steeringDir).filter(f => f.endsWith(".md"));
  }
}
