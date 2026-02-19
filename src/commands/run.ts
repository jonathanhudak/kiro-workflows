/**
 * spool run <workflow> "<task>"
 *
 * Runs a complete workflow formula end-to-end.
 */

import { existsSync } from "fs";
import { join } from "path";
import { WorkflowOrchestrator } from "../orchestrator.js";
import { loadConfig, discoverWorkflows } from "../config.js";
import { resolveAdapter } from "./shared.js";
import { error } from "../utils.js";
import type { RunConfig } from "../core/types.js";

export async function commandRun(args: string[]): Promise<void> {
  const config: Partial<RunConfig> = {};
  let workflow: string | undefined;
  let task: string | undefined;
  let adapterOverride: string | undefined;
  let dryRun = false;
  let fromStep: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--acp":
        config.useAcp = true;
        break;
      case "--max-iter":
        config.maxIterations = parseInt(args[++i]);
        break;
      case "--no-verify":
        config.verifyEach = false;
        break;
      case "--verbose":
        config.verbose = true;
        break;
      case "--adapter":
        adapterOverride = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--from":
        fromStep = parseInt(args[++i]);
        break;
      default:
        if (!workflow) {
          workflow = args[i];
        } else if (!task) {
          task = args[i];
        }
    }
  }

  if (!workflow || !task) {
    error("Usage: spool run <workflow> \"<task>\"");
    process.exit(1);
  }

  const spoolDir = join(process.cwd(), ".spool");
  if (!existsSync(join(spoolDir, "agents"))) {
    error("No .spool/agents/ found. Run 'spool init' first.");
    process.exit(1);
  }

  const available = discoverWorkflows(spoolDir);
  if (!available.includes(workflow)) {
    error(`Unknown workflow: ${workflow}`);
    error(`Available: ${available.join(", ")}`);
    process.exit(1);
  }

  const spoolConfig = loadConfig(process.cwd());
  if (adapterOverride) {
    spoolConfig.adapter = adapterOverride;
  }

  if (dryRun) {
    const { loadWorkflow } = await import("../config.js");
    const formula = loadWorkflow(spoolDir, workflow);
    console.log(`Workflow: ${formula.name}`);
    console.log(`Description: ${formula.description}`);
    console.log(`Adapter: ${spoolConfig.adapter}\n`);
    console.log("Steps:");
    for (const step of formula.steps) {
      const flags = [
        step.for_each ? `loop(${step.for_each})` : null,
        step.verifier ? `verify(${step.verifier})` : null,
        step.always ? "always" : null,
      ].filter(Boolean).join(", ");
      console.log(`  ${step.id.padEnd(15)} ${step.agent.padEnd(15)} ${flags}`);
    }
    return;
  }

  const adapter = resolveAdapter(spoolConfig, config.useAcp);
  const orchestrator = new WorkflowOrchestrator(adapter, spoolConfig, config);
  const result = await orchestrator.run(workflow, task);

  console.log(`\nRun: ${result.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Stories: ${result.stories.filter(s => s.status === "done").length}/${result.stories.length}`);
  console.log(`Branch: ${result.branch}`);

  process.exit(result.status === "done" ? 0 : 1);
}
