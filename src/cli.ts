#!/usr/bin/env node

/**
 * spool CLI — Provider-agnostic multi-agent workflow orchestration.
 *
 * Commands:
 *   spool run <workflow> "<task>"     Run a complete workflow
 *   spool exec <agent> [prompt]       Run a single agent
 *   spool loop <agent> <verifier>     Run the Ralph loop standalone
 *   spool init                        Scaffold .spool/ in current project
 *   spool status                      Show workflow run status
 *   spool list                        List workflows and agents
 *   spool learn                       Extract learnings manually
 *   spool adapters                    Show available adapters
 */

import { error } from "./utils.js";

function printUsage() {
  console.log(`
spool — Provider-agnostic multi-agent workflow orchestration

USAGE:
  spool run <workflow> "<task>"        Run a complete workflow
  spool exec <agent> [prompt]          Run a single agent
  spool loop <agent> <verifier>        Run the Ralph loop standalone
  spool init [--dir <path>]            Scaffold .spool/ in current project
  spool status [--run <id>] [--all]    Show workflow run status
  spool list                           List workflows and agents
  spool learn [--since HEAD~N]         Extract learnings manually
  spool adapters                       Show available adapters

WORKFLOWS:
  feature-dev      Plan, implement, test, and review a feature
  bug-fix          Triage, investigate, fix, and verify a bug
  security-audit   Scan, prioritize, fix, and test security issues

OPTIONS:
  --adapter <name>   Override adapter (claude-code, kiro)
  --acp              Use ACP protocol (Kiro adapter only)
  --max-iter <n>     Max iterations (default: 15)
  --no-verify        Skip verification after each story
  --verbose          Show detailed output
  --dry-run          Print plan without executing

EXAMPLES:
  spool run feature-dev "Add user authentication with OAuth2"
  spool exec planner "Design a caching layer"
  spool loop developer verifier --task "Implement the login form"
  spool status --run abc123
  spool adapters
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case "run": {
      const { commandRun } = await import("./commands/run.js");
      await commandRun(commandArgs);
      break;
    }
    case "init": {
      const { commandInit } = await import("./commands/init.js");
      commandInit(commandArgs);
      break;
    }
    case "exec": {
      const { commandExec } = await import("./commands/exec.js");
      await commandExec(commandArgs);
      break;
    }
    case "loop": {
      const { commandLoop } = await import("./commands/loop.js");
      await commandLoop(commandArgs);
      break;
    }
    case "status": {
      const { commandStatus } = await import("./commands/status.js");
      commandStatus(commandArgs);
      break;
    }
    case "list": {
      const { commandList } = await import("./commands/list.js");
      commandList();
      break;
    }
    case "learn": {
      const { commandLearn } = await import("./commands/learn.js");
      await commandLearn(commandArgs);
      break;
    }
    case "adapters": {
      const { commandAdapters } = await import("./commands/adapters.js");
      await commandAdapters();
      break;
    }
    default:
      error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
