/**
 * Claude Code adapter — executes agents via the `claude` CLI.
 *
 * Uses `claude -p` (print mode) for non-interactive execution.
 * Steering files are prepended to the prompt as context.
 */

import { execSync, spawnSync } from "child_process";
import type { Adapter, AdapterStatus, AgentDefinition, ExecutionContext, AgentResult, AdapterConfig } from "../core/types.js";

export class ClaudeCodeAdapter implements Adapter {
  name = "claude-code";
  private config: AdapterConfig;
  private validated = false;

  constructor(config?: AdapterConfig) {
    this.config = {
      command: "claude",
      args: [],
      timeout: 300,
      ...config,
    };
  }

  async validate(): Promise<AdapterStatus> {
    try {
      const result = spawnSync(this.config.command!, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status === 0) {
        const version = (result.stdout || "").trim();
        this.validated = true;
        return { installed: true, version };
      }
      return { installed: false, error: result.stderr || "Non-zero exit" };
    } catch (err: unknown) {
      return { installed: false, error: (err as Error).message };
    }
  }

  async exec(agent: AgentDefinition, context: ExecutionContext): Promise<AgentResult> {
    if (!this.validated) {
      const status = await this.validate();
      if (!status.installed) {
        throw new Error(`Claude Code CLI not found: ${status.error}`);
      }
    }

    // Build the full prompt: steering context + agent prompt + execution context
    const fullPrompt = this.buildPrompt(agent, context);
    const timeoutMs = (this.config.timeout || 300) * 1000;

    const start = Date.now();

    try {
      const args = ["-p", ...this.config.args || []];
      const result = execSync(
        `${this.config.command} ${args.join(" ")}`,
        {
          input: fullPrompt,
          cwd: context.projectDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: timeoutMs,
          encoding: "utf-8",
          env: { ...process.env, ...this.config.env },
        }
      );

      return {
        output: result,
        exitCode: 0,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; status?: number; message: string };
      const output = execErr.stdout || "";
      const durationMs = Date.now() - start;

      // If we got substantial output, the agent may have partially succeeded
      if (output.length > 50) {
        return { output, exitCode: execErr.status || 1, durationMs };
      }

      throw new Error(
        `Claude Code agent '${agent.name}' failed: ${execErr.stderr || execErr.message}`
      );
    }
  }

  private buildPrompt(agent: AgentDefinition, context: ExecutionContext): string {
    const parts: string[] = [];

    // Inject steering context
    if (context.steeringContent) {
      for (const [filename, content] of Object.entries(context.steeringContent)) {
        parts.push(`## ${filename}\n\n${content}`);
      }
      parts.push("---\n");
    }

    // Agent system prompt
    parts.push(agent.prompt);

    // Execution-specific prompt
    if (context.prompt) {
      parts.push("\n---\n");
      parts.push(context.prompt);
    }

    // Feedback from previous attempt
    if (context.feedback) {
      parts.push("\n---\n## Previous Attempt Feedback\n");
      parts.push(context.feedback);
    }

    return parts.join("\n");
  }
}
