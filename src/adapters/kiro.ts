/**
 * Kiro adapter — executes agents via kiro-cli.
 *
 * Supports two modes:
 * - CLI mode: spawns a fresh kiro-cli process per invocation
 * - ACP mode: persistent JSON-RPC process (faster, reuses connection)
 */

import { execSync, spawnSync, spawn, ChildProcess } from "child_process";
import { createInterface, Interface } from "readline";
import type { Adapter, AdapterStatus, AgentDefinition, ExecutionContext, AgentResult, AdapterConfig } from "../core/types.js";

export class KiroAdapter implements Adapter {
  name = "kiro";
  private config: AdapterConfig;
  private useAcp: boolean;
  private acpProcess?: ChildProcess;
  private acpReader?: Interface;
  private acpReqId = 0;
  private acpPending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private validated = false;

  constructor(config?: AdapterConfig & { useAcp?: boolean }) {
    this.config = {
      command: "kiro-cli",
      args: [],
      timeout: 300,
      ...config,
    };
    this.useAcp = config?.useAcp ?? false;
  }

  async validate(): Promise<AdapterStatus> {
    try {
      const result = spawnSync("which", [this.config.command!], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status === 0) {
        this.validated = true;
        return { installed: true, version: "unknown" };
      }
      return { installed: false, error: `${this.config.command} not found` };
    } catch (err: unknown) {
      return { installed: false, error: (err as Error).message };
    }
  }

  async exec(agent: AgentDefinition, context: ExecutionContext): Promise<AgentResult> {
    if (this.useAcp) {
      return this.execAcp(agent, context);
    }
    return this.execCli(agent, context);
  }

  async cleanup(): Promise<void> {
    if (this.acpProcess) {
      this.acpProcess.kill();
      this.acpReader?.close();
      this.acpProcess = undefined;
      this.acpReader = undefined;
    }
  }

  // ─── CLI Mode ──────────────────────────────────────────────────────────

  private async execCli(agent: AgentDefinition, context: ExecutionContext): Promise<AgentResult> {
    const prompt = this.buildPrompt(agent, context);
    const timeoutMs = (this.config.timeout || 300) * 1000;
    const start = Date.now();

    try {
      const result = execSync(
        `echo ${JSON.stringify(prompt)} | ${this.config.command} --agent ${agent.name}`,
        {
          cwd: context.projectDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: timeoutMs,
          encoding: "utf-8",
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

      if (output.length > 50) {
        return { output, exitCode: execErr.status || 1, durationMs };
      }

      throw new Error(`Kiro agent '${agent.name}' failed: ${execErr.stderr || execErr.message}`);
    }
  }

  // ─── ACP Mode ──────────────────────────────────────────────────────────

  private async execAcp(agent: AgentDefinition, context: ExecutionContext): Promise<AgentResult> {
    if (!this.acpProcess) {
      await this.startAcp();
    }

    const start = Date.now();
    const sessionId = await this.acpNewSession(context.projectDir);
    await this.acpSetAgent(sessionId, agent.name);

    const prompt = this.buildPrompt(agent, context);
    const output = await this.acpPrompt(sessionId, prompt);

    return {
      output,
      exitCode: 0,
      durationMs: Date.now() - start,
    };
  }

  private async startAcp(): Promise<void> {
    const kiroPath = this.config.command || "kiro-cli";

    this.acpProcess = spawn(kiroPath, ["acp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.acpReader = createInterface({ input: this.acpProcess.stdout! });
    this.acpReader.on("line", (line) => this.handleAcpLine(line));

    await this.acpSend("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "spool", version: "2.0.0" },
    });
  }

  private async acpNewSession(cwd: string): Promise<string> {
    const result = await this.acpSend("session/new", { cwd, mcpServers: [] }) as { sessionId?: string } | null;
    return result?.sessionId || "";
  }

  private async acpSetAgent(sessionId: string, agent: string): Promise<void> {
    await this.acpSend("_kiro.dev/commands/execute", {
      sessionId,
      command: `/agent ${agent}`,
    });
  }

  private async acpPrompt(sessionId: string, text: string): Promise<string> {
    const id = ++this.acpReqId;

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "session/prompt",
      params: {
        sessionId,
        content: [{ type: "text", text }],
      },
    });
    this.acpProcess!.stdin!.write(request + "\n");

    return new Promise((resolve) => {
      let fullResponse = "";

      const streamHandler = (line: string) => {
        try {
          const msg = JSON.parse(line);

          if (msg.method === "session/notification") {
            const kind = msg.params?.kind || msg.params?.type;
            if (kind === "AgentMessageChunk") {
              fullResponse += msg.params?.content || "";
            } else if (kind === "TurnEnd") {
              this.acpReader!.removeListener("line", streamHandler);
              this.acpReader!.on("line", (l) => this.handleAcpLine(l));
              resolve(fullResponse);
            }
          }

          if (msg.id === id && msg.result !== undefined) {
            this.acpReader!.removeListener("line", streamHandler);
            this.acpReader!.on("line", (l) => this.handleAcpLine(l));
            resolve(fullResponse || JSON.stringify(msg.result));
          }
        } catch {
          // Skip non-JSON lines
        }
      };

      this.acpReader!.removeAllListeners("line");
      this.acpReader!.on("line", streamHandler);
    });
  }

  private async acpSend(method: string, params: unknown): Promise<unknown> {
    const id = ++this.acpReqId;

    return new Promise((resolve, reject) => {
      this.acpPending.set(id, { resolve, reject });

      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      this.acpProcess!.stdin!.write(request + "\n");
    });
  }

  private handleAcpLine(line: string): void {
    try {
      const msg = JSON.parse(line);
      if (msg.id && this.acpPending.has(msg.id)) {
        const { resolve, reject } = this.acpPending.get(msg.id)!;
        this.acpPending.delete(msg.id);
        if (msg.error) {
          reject(msg.error);
        } else {
          resolve(msg.result);
        }
      }
    } catch {
      // Skip non-JSON
    }
  }

  private buildPrompt(agent: AgentDefinition, context: ExecutionContext): string {
    const parts: string[] = [];

    if (context.steeringContent) {
      for (const [filename, content] of Object.entries(context.steeringContent)) {
        parts.push(`## ${filename}\n\n${content}`);
      }
      parts.push("---\n");
    }

    parts.push(agent.prompt);

    if (context.prompt) {
      parts.push("\n---\n");
      parts.push(context.prompt);
    }

    if (context.feedback) {
      parts.push("\n---\n## Previous Attempt Feedback\n");
      parts.push(context.feedback);
    }

    return parts.join("\n");
  }
}
