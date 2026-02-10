/**
 * Agent Runner — executes a Kiro CLI agent with a prompt.
 * Supports CLI mode (shell out) and ACP mode (JSON-RPC).
 * Each invocation is a FRESH SESSION (the Ralph pattern).
 */

import { execSync, spawnSync } from "child_process";
import { RunConfig } from "../types.js";
import { AcpClient } from "../acp/client.js";
import { error, warn, log } from "../utils.js";

export class AgentRunner {
  private config: RunConfig;
  private acpClient?: AcpClient;
  private cliVerified = false;

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

  /**
   * Verify kiro-cli is installed and authenticated.
   * Call once before first run to fail fast with a helpful message.
   */
  private verifyCli(): void {
    if (this.cliVerified) return;

    const check = spawnSync("which", ["kiro-cli"], { encoding: "utf-8" });
    if (check.status !== 0) {
      throw new Error(
        "kiro-cli not found. Install it:\n" +
        "  curl -fsSL https://cli.kiro.dev/install | bash\n" +
        "  export PATH=\"$HOME/.local/bin:$PATH\"\n" +
        "  kiro-cli login\n\n" +
        "Or use --acp mode if Kiro is running as a persistent process."
      );
    }
    this.cliVerified = true;
  }

  private runCli(agent: string, prompt: string): string {
    this.verifyCli();

    if (this.config.verbose) {
      log(`[agent-runner] Invoking kiro-cli --agent ${agent} (timeout: 5m)`);
    }

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
      const output = err.stdout || "";
      const stderr = err.stderr || "";
      if (this.config.verbose) {
        error(`[agent-runner] kiro-cli failed: ${err.message}`);
        if (stderr) error(`[agent-runner] stderr: ${stderr.slice(0, 500)}`);
      }
      // If we got some stdout, the agent may have partially succeeded
      if (output.length > 50) {
        warn(`[agent-runner] Agent returned partial output (${output.length} chars)`);
        return output;
      }
      throw new Error(`Agent '${agent}' failed: ${stderr || err.message}`);
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
