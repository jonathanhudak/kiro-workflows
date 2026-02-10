/**
 * ACP Client — JSON-RPC 2.0 client for kiro-cli acp.
 * Spawns a persistent kiro-cli process and communicates over stdin/stdout.
 */

import { spawn, ChildProcess } from "child_process";
import { createInterface, Interface } from "readline";

export class AcpClient {
  private process?: ChildProcess;
  private reader?: Interface;
  private reqId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  async start(): Promise<void> {
    const kiroPath = process.env.KIRO_CLI_PATH || "kiro-cli";

    this.process = spawn(kiroPath, ["acp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.reader = createInterface({ input: this.process.stdout! });
    this.reader.on("line", (line) => this.handleLine(line));

    // Initialize
    const result = await this.send("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "kiro-workflows", version: "1.0.0" },
    });

    const version = result?.agentInfo?.version || "unknown";
    process.stderr.write(`[acp] Connected to kiro-cli ${version}\n`);
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.reader?.close();
  }

  async newSession(cwd: string): Promise<string> {
    const result = await this.send("session/new", {
      cwd,
      mcpServers: [],
    });
    return result?.sessionId || "";
  }

  async setAgent(sessionId: string, agent: string): Promise<void> {
    await this.send("_kiro.dev/commands/execute", {
      sessionId,
      command: `/agent ${agent}`,
    });
  }

  async prompt(sessionId: string, text: string): Promise<string> {
    const id = ++this.reqId;

    // Send the prompt request
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "session/prompt",
      params: {
        sessionId,
        content: [{ type: "text", text }],
      },
    });
    this.process!.stdin!.write(request + "\n");

    // Collect streaming response until TurnEnd
    return new Promise((resolve) => {
      let fullResponse = "";

      const originalHandler = this.handleLine.bind(this);
      const streamHandler = (line: string) => {
        try {
          const msg = JSON.parse(line);

          // Check for notifications (streaming)
          if (msg.method === "session/notification") {
            const kind = msg.params?.kind || msg.params?.type;
            if (kind === "AgentMessageChunk") {
              fullResponse += msg.params?.content || "";
            } else if (kind === "TurnEnd") {
              this.reader!.removeListener("line", streamHandler);
              this.reader!.on("line", (l) => this.handleLine(l));
              resolve(fullResponse);
            }
          }

          // Check for direct response (non-streaming)
          if (msg.id === id && msg.result !== undefined) {
            this.reader!.removeListener("line", streamHandler);
            this.reader!.on("line", (l) => this.handleLine(l));
            resolve(fullResponse || JSON.stringify(msg.result));
          }
        } catch {
          // Skip non-JSON lines
        }
      };

      this.reader!.removeAllListeners("line");
      this.reader!.on("line", streamHandler);
    });
  }

  private async send(method: string, params: any): Promise<any> {
    const id = ++this.reqId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      this.process!.stdin!.write(request + "\n");
    });
  }

  private handleLine(line: string) {
    try {
      const msg = JSON.parse(line);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
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
}
