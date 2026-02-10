#!/usr/bin/env node

/**
 * kiro-workflow CLI
 *
 * Usage:
 *   kiro-workflow run feature-dev "Add OAuth2 authentication"
 *   kiro-workflow run bug-fix "Fix login timeout on slow connections"
 *   kiro-workflow run security-audit "Audit auth module"
 *   kiro-workflow status
 *   kiro-workflow init
 */

import { WorkflowOrchestrator } from "./orchestrator.js";
import { WORKFLOWS } from "./workflows.js";
import { WorkflowType, RunConfig, DEFAULT_CONFIG } from "./types.js";
import { log, success, error } from "./utils.js";
import { existsSync, cpSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", ".kiro");

function printUsage() {
  console.log(`
kiro-workflow — Multi-agent development workflows for Kiro CLI

USAGE:
  kiro-workflow run <workflow> "<task description>"
  kiro-workflow init [--dir <path>]
  kiro-workflow status
  kiro-workflow list

WORKFLOWS:
  feature-dev      Plan, implement, test, and review a feature
  bug-fix          Triage, investigate, fix, and verify a bug
  security-audit   Scan, prioritize, fix, and test security issues

OPTIONS:
  --acp            Use ACP protocol (persistent process, faster)
  --max-iter <n>   Max iterations (default: 15)
  --no-verify      Skip verification after each story
  --verbose        Show detailed output

EXAMPLES:
  kiro-workflow run feature-dev "Add user authentication with OAuth2"
  kiro-workflow run bug-fix "Fix: login form submits twice on slow connections"
  kiro-workflow run security-audit "Audit the API authentication module"
  kiro-workflow init                # Copy .kiro/ agents + steering into current project
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "run":
      await commandRun(args.slice(1));
      break;
    case "init":
      commandInit(args.slice(1));
      break;
    case "list":
      commandList();
      break;
    case "status":
      commandStatus();
      break;
    default:
      error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

async function commandRun(args: string[]) {
  // Parse args
  const config: Partial<RunConfig> = {};
  let workflow: string | undefined;
  let task: string | undefined;

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
      default:
        if (!workflow) {
          workflow = args[i];
        } else if (!task) {
          task = args[i];
        }
    }
  }

  if (!workflow || !task) {
    error("Usage: kiro-workflow run <workflow> \"<task>\"");
    process.exit(1);
  }

  if (!WORKFLOWS[workflow as WorkflowType]) {
    error(`Unknown workflow: ${workflow}`);
    error(`Available: ${Object.keys(WORKFLOWS).join(", ")}`);
    process.exit(1);
  }

  // Check for .kiro/agents
  if (!existsSync(join(process.cwd(), ".kiro", "agents"))) {
    error("No .kiro/agents/ found. Run 'kiro-workflow init' first.");
    process.exit(1);
  }

  const orchestrator = new WorkflowOrchestrator(config);
  const result = await orchestrator.run(workflow as WorkflowType, task);

  // Print summary
  console.log(`\nRun: ${result.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Stories: ${result.stories.filter((s) => s.status === "done").length}/${result.stories.length}`);
  console.log(`Branch: ${result.branch}`);

  process.exit(result.status === "done" ? 0 : 1);
}

function commandInit(args: string[]) {
  const targetDir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : process.cwd();
  const kiroDir = join(targetDir, ".kiro");

  if (existsSync(join(kiroDir, "agents"))) {
    log(".kiro/agents/ already exists. Merging new agents...");
  }

  if (!existsSync(ASSETS_DIR)) {
    error("Asset directory not found. Reinstall kiro-workflows.");
    process.exit(1);
  }

  cpSync(ASSETS_DIR, kiroDir, { recursive: true, force: false });
  success(`✅ Initialized .kiro/ in ${targetDir}`);
  log("Agents: " + readdirSync(join(kiroDir, "agents")).filter(f => f.endsWith(".json")).join(", "));
  log("Steering: " + readdirSync(join(kiroDir, "steering")).join(", "));
  log("\nCustomize steering files for your project:");
  log("  .kiro/steering/structure.md — your codebase layout");
  log("  .kiro/steering/tech.md — your tech stack");
  log("  .kiro/steering/product.md — your business context");
}

function commandList() {
  console.log("Available workflows:\n");
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    console.log(`  ${name}`);
    console.log(`    ${wf.description}`);
    console.log(`    Pipeline: ${wf.steps.map((s) => s.agent).join(" → ")}`);
    console.log();
  }
}

function commandStatus() {
  const stateDir = join(process.cwd(), ".kiro", ".workflows");
  if (!existsSync(stateDir)) {
    log("No workflow runs found.");
    return;
  }

  const files = readdirSync(stateDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    log("No workflow runs found.");
    return;
  }

  for (const file of files.slice(-5)) {
    try {
      const run = JSON.parse(require("fs").readFileSync(join(stateDir, file), "utf-8"));
      const done = run.stories?.filter((s: any) => s.status === "done").length || 0;
      const total = run.stories?.length || 0;
      console.log(`  ${run.id}  ${run.workflow}  ${run.status}  ${done}/${total} stories  ${run.branch}`);
    } catch {
      // skip corrupt files
    }
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
