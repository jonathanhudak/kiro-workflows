/**
 * spool learn [--since HEAD~N] [--run <run-id>]
 *
 * Manually trigger the compound agent to extract learnings.
 */

import { existsSync } from "fs";
import { join } from "path";
import { Runner } from "../core/runner.js";
import { Ledger } from "../core/ledger.js";
import { loadConfig } from "../config.js";
import { resolveAdapter } from "./shared.js";
import { error, log, success } from "../utils.js";
import { execSync } from "child_process";

export async function commandLearn(args: string[]): Promise<void> {
  let since = "HEAD~3";
  let runId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--since":
        since = args[++i];
        break;
      case "--run":
        runId = args[++i];
        break;
    }
  }

  const spoolDir = join(process.cwd(), ".spool");
  if (!existsSync(join(spoolDir, "agents"))) {
    error("No .spool/agents/ found. Run 'spool init' first.");
    process.exit(1);
  }

  const spoolConfig = loadConfig(process.cwd());
  const adapter = resolveAdapter(spoolConfig);
  const runner = new Runner(adapter, spoolConfig);

  // Get git diff for context
  let gitContext = "";
  try {
    gitContext = execSync(`git log --oneline ${since}`, {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();
  } catch {
    gitContext = "(could not read git log)";
  }

  // Get ledger context if run specified
  let ledgerContext = "";
  if (runId) {
    const ledger = new Ledger(join(spoolDir, "ledger.jsonl"));
    const events = ledger.getRunEvents(runId);
    ledgerContext = events.map(e => JSON.stringify(e)).join("\n");
  }

  const prompt = `Extract learnings from recent development work.

## Git Log (${since})
${gitContext}

${ledgerContext ? `## Run Events\n${ledgerContext}\n` : ""}

Instructions:
1. Review the git log and any run events
2. Identify what worked well, what didn't, and surprises
3. Write learnings to .spool/steering/learnings.md
4. Each learning: Context -> Insight -> Action

Keep learnings concise and actionable.`;

  log("Running compound agent to extract learnings...");
  const output = await runner.runAgent("compound", prompt, process.cwd());

  success("Learnings extracted");
  console.log(output);

  await runner.cleanup();
}
