/**
 * spool list
 *
 * List available workflows and agents.
 */

import { join } from "path";
import { discoverWorkflows, discoverAgents, loadWorkflow } from "../config.js";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

export function commandList(): void {
  const spoolDir = join(process.cwd(), ".spool");
  const workflowNames = discoverWorkflows(spoolDir);
  const agentNames = discoverAgents(spoolDir);

  console.log(`${BOLD}Workflows:${NC}\n`);
  if (workflowNames.length === 0) {
    console.log(`  ${DIM}(none — run 'spool init' to set up)${NC}\n`);
  } else {
    for (const name of workflowNames) {
      try {
        const wf = loadWorkflow(spoolDir, name);
        console.log(`  ${BOLD}${name}${NC}`);
        console.log(`    ${wf.description}`);
        console.log(`    Pipeline: ${wf.steps.map(s => s.agent).join(" → ")}`);
        console.log();
      } catch {
        console.log(`  ${name} ${DIM}(could not load)${NC}\n`);
      }
    }
  }

  console.log(`${BOLD}Agents:${NC}\n`);
  if (agentNames.length === 0) {
    console.log(`  ${DIM}(none)${NC}\n`);
  } else {
    console.log(`  ${agentNames.join(", ")}\n`);
  }
}
