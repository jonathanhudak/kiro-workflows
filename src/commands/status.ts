/**
 * spool status [--run <run-id>] [--all]
 *
 * Show workflow run status from the JSONL ledger.
 */

import { existsSync } from "fs";
import { join } from "path";
import { Ledger } from "../core/ledger.js";
import { log } from "../utils.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const NC = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

export function commandStatus(args: string[]): void {
  const showAll = args.includes("--all");
  const runIdx = args.indexOf("--run");
  const specificRun = runIdx !== -1 ? args[runIdx + 1] : undefined;

  const ledgerPath = join(process.cwd(), ".spool", "ledger.jsonl");
  if (!existsSync(ledgerPath)) {
    log("No workflow runs found. Run 'spool run' to start a workflow.");
    return;
  }

  const ledger = new Ledger(ledgerPath);

  if (specificRun) {
    showRunDetail(ledger, specificRun);
    return;
  }

  const runs = ledger.getRuns();
  if (runs.length === 0) {
    log("No workflow runs found.");
    return;
  }

  const display = showAll ? runs : runs.slice(-5);
  console.log(`${BOLD}Recent runs:${NC}\n`);

  for (const run of display) {
    const icon = run.status === "pass" ? `${GREEN}✓${NC}`
      : run.status === "fail" ? `${RED}✗${NC}`
      : `${YELLOW}↻${NC}`;
    console.log(`  ${icon} ${run.runId}  ${run.workflow.padEnd(16)}  ${run.status.padEnd(8)}  ${DIM}${run.timestamp}${NC}`);
  }
  console.log();
}

function showRunDetail(ledger: Ledger, runId: string): void {
  const events = ledger.getRunEvents(runId);
  if (events.length === 0) {
    log(`No events found for run: ${runId}`);
    return;
  }

  const first = events[0];
  if (first.type === "run_start") {
    console.log(`${BOLD}Run:${NC} ${first.runId}  |  ${BOLD}Workflow:${NC} ${first.workflow}  |  ${BOLD}Adapter:${NC} ${first.adapter}`);
    console.log(`${BOLD}Started:${NC} ${first.timestamp}\n`);
  }

  for (const event of events) {
    switch (event.type) {
      case "step_start":
        console.log(`  ${YELLOW}▶${NC} ${event.step.padEnd(15)} ${event.agent}`);
        break;
      case "step_complete": {
        const icon = event.status === "pass" ? `${GREEN}✓${NC}` : `${RED}✗${NC}`;
        const dur = event.durationMs ? `${DIM}${Math.round(event.durationMs / 1000)}s${NC}` : "";
        console.log(`  ${icon} ${event.step.padEnd(15)} ${dur}`);
        break;
      }
      case "loop_start":
        console.log(`    ${YELLOW}↻${NC} ${event.storyId} attempt ${event.attempt}`);
        break;
      case "loop_pass":
        console.log(`    ${GREEN}✓${NC} ${event.storyId} passed`);
        break;
      case "loop_fail":
        console.log(`    ${RED}✗${NC} ${event.storyId} failed: ${DIM}${event.feedback.slice(0, 60)}${NC}`);
        break;
      case "loop_exhausted":
        console.log(`    ${RED}✗${NC} ${event.storyId} exhausted after ${event.attempts} attempts`);
        break;
      case "run_complete": {
        const statusColor = event.status === "pass" ? GREEN : RED;
        console.log(`\n${statusColor}${BOLD}Status: ${event.status}${NC}`);
        break;
      }
    }
  }
  console.log();
}
