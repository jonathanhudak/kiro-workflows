/**
 * Agent Runner — executes a Kiro CLI agent with a prompt.
 * Supports CLI mode (shell out) and ACP mode (JSON-RPC).
 * Each invocation is a FRESH SESSION (the Ralph pattern).
 */

import { execSync } from "child_process";
import { RunConfig } from "../types.js";
import { AcpClient } from "../acp/client.js";

export class AgentRunner {
  private config: RunConfig;
  private acpClient?: AcpClient;

  constructor(config: RunConfig) {
    this.config = config;
  }

  /**
   * Run an agent with a prompt. Returns the agent's full output.
   * Each call is a fresh session — no memory carried over.
   */
  async run(agent: string, prompt: string): Promise<string> {
    if (this.config.useAcp) {
      return this.runAcp(agent, prompt);
    }
    return this.runCli(agent, prompt);
  }

  private runCli(agent: string, prompt: string): string {
    try {
      const result = execSync(
        `echo ${JSON.stringify(prompt)} | kiro-cli --agent ${agent}`,
        {
          cwd: this.config.projectDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 300_000, // 5 min per agent call
          encoding: "utf-8",
        }
      );
      return result;
    } catch (err: any) {
      return err.stdout || err.message;
    }
  }

  private async runAcp(agent: string, prompt: string): Promise<string> {
    if (!this.acpClient) {
      this.acpClient = new AcpClient();
      await this.acpClient.start();
    }

    // Fresh session per invocation (Ralph pattern)
    const sessionId = await this.acpClient.newSession(this.config.projectDir);
    await this.acpClient.setAgent(sessionId, agent);
    const response = await this.acpClient.prompt(sessionId, prompt);
    return response;
  }

  async cleanup() {
    if (this.acpClient) {
      await this.acpClient.stop();
    }
  }
}
