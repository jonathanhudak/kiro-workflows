/**
 * spool exec <agent> [prompt]
 *
 * Run a single agent in isolation, without a full workflow.
 */

import { existsSync } from "fs";
import { join } from "path";
import { Runner } from "../core/runner.js";
import { loadConfig } from "../config.js";
import { resolveAdapter } from "./shared.js";
import { error, log } from "../utils.js";

export async function commandExec(args: string[]): Promise<void> {
  let agentName: string | undefined;
  let prompt: string | undefined;
  let adapterOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--adapter":
      case "--via":
        adapterOverride = args[++i];
        break;
      default:
        if (!agentName) {
          agentName = args[i];
        } else if (!prompt) {
          prompt = args[i];
        }
    }
  }

  if (!agentName) {
    error("Usage: spool exec <agent> [prompt]");
    process.exit(1);
  }

  const spoolDir = join(process.cwd(), ".spool");
  if (!existsSync(join(spoolDir, "agents"))) {
    error("No .spool/agents/ found. Run 'spool init' first.");
    process.exit(1);
  }

  // Read prompt from stdin if not provided
  if (!prompt) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    prompt = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (!prompt) {
    error("No prompt provided. Pass as argument or pipe via stdin.");
    process.exit(1);
  }

  const spoolConfig = loadConfig(process.cwd());
  if (adapterOverride) {
    spoolConfig.adapter = adapterOverride;
  }

  const adapter = resolveAdapter(spoolConfig);
  const runner = new Runner(adapter, spoolConfig);

  log(`Running agent: ${agentName}`);
  const output = await runner.runAgent(agentName, prompt, process.cwd());

  console.log(output);
  await runner.cleanup();
}
