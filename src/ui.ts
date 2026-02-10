/**
 * Terminal UI for kiro-workflow progress.
 *
 * Renders a compact, live-updating display:
 *
 *   ┌─ feature-dev: "Add OAuth2 authentication"
 *   │  Pipeline: planner → developer → verifier → reviewer → compound
 *   │                        ▲
 *   ├─ Stories [3/7] ██████░░░░░░░░ 43%
 *   │  ✅ US-001 Set up project structure
 *   │  ✅ US-002 Add user model
 *   │  ⏳ US-003 Implement OAuth2 flow          ← iteration 2/3
 *   │  ⬚ US-004 Add token refresh
 *   │  ⬚ US-005 Protected routes
 *   │  ⬚ US-006 Error handling
 *   │  ⬚ US-007 Tests
 *   │
 *   ├─ Activity
 *   │  12:03:41  developer  Running agent on US-003...
 *   │  12:02:18  verifier   ❌ FAIL: missing refresh token handling
 *   │  12:01:05  developer  ✅ US-002 committed
 *   └─ 4m 22s elapsed
 *
 * Uses ANSI escape codes to redraw in place (no scroll spam).
 */

import { WorkflowRun, Story } from "./types.js";

// ANSI
const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K`;
const MOVE_UP = (n: number) => `${ESC}[${n}A`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const NC = `${ESC}[0m`;
const GREEN = `${ESC}[32m`;
const RED = `${ESC}[31m`;
const YELLOW = `${ESC}[33m`;
const BLUE = `${ESC}[34m`;
const CYAN = `${ESC}[36m`;
const GRAY = `${ESC}[90m`;

interface ActivityEntry {
  time: string;
  agent: string;
  message: string;
}

export class TerminalUI {
  private lastLineCount = 0;
  private activities: ActivityEntry[] = [];
  private maxActivities = 5;
  private startTime: number;
  private pipelineSteps: string[] = [];
  private currentStepIndex = -1;
  private enabled: boolean;

  constructor(opts: { enabled?: boolean } = {}) {
    this.startTime = Date.now();
    this.enabled = opts.enabled !== false && process.stderr.isTTY === true;

    if (this.enabled) {
      process.stderr.write(HIDE_CURSOR);
      // Show cursor on exit
      const cleanup = () => process.stderr.write(SHOW_CURSOR);
      process.on("exit", cleanup);
      process.on("SIGINT", () => { cleanup(); process.exit(130); });
      process.on("SIGTERM", () => { cleanup(); process.exit(143); });
    }
  }

  setPipeline(steps: string[]) {
    this.pipelineSteps = steps;
  }

  setCurrentStep(stepIndex: number) {
    this.currentStepIndex = stepIndex;
  }

  addActivity(agent: string, message: string) {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.activities.unshift({ time, agent, message });
    if (this.activities.length > this.maxActivities) {
      this.activities.pop();
    }
  }

  render(run: WorkflowRun) {
    if (!this.enabled) return;

    const lines: string[] = [];
    const done = run.stories.filter(s => s.status === "done").length;
    const total = run.stories.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Header
    lines.push(`${GRAY}┌─${NC} ${BOLD}${run.workflow}${NC}: "${truncate(run.task, 60)}"`);

    // Pipeline with pointer
    if (this.pipelineSteps.length > 0) {
      const pipeStr = this.pipelineSteps.map((s, i) => {
        if (i === this.currentStepIndex) return `${CYAN}${BOLD}${s}${NC}`;
        if (i < this.currentStepIndex) return `${GREEN}${s}${NC}`;
        return `${GRAY}${s}${NC}`;
      }).join(` ${GRAY}→${NC} `);
      lines.push(`${GRAY}│${NC}  ${pipeStr}`);
    }

    // Progress bar
    if (total > 0) {
      const barWidth = 20;
      const filled = Math.round((done / total) * barWidth);
      const bar = `${GREEN}${"█".repeat(filled)}${GRAY}${"░".repeat(barWidth - filled)}${NC}`;
      lines.push(`${GRAY}├─${NC} Stories ${BOLD}[${done}/${total}]${NC} ${bar} ${pct}%`);
    } else {
      lines.push(`${GRAY}├─${NC} Stories ${DIM}(planning...)${NC}`);
    }

    // Story list (compact)
    for (const story of run.stories) {
      const icon = storyIcon(story);
      const label = truncate(`${story.id} ${story.title}`, 55);
      let suffix = "";

      if (story.status === "running") {
        const retryInfo = story.retryCount > 0 ? ` ${YELLOW}retry ${story.retryCount}/${story.maxRetries}${NC}` : "";
        suffix = `  ${CYAN}← iteration ${run.iteration}${NC}${retryInfo}`;
      } else if (story.status === "failed") {
        suffix = `  ${RED}failed${NC}`;
      }

      lines.push(`${GRAY}│${NC}  ${icon} ${story.status === "running" ? BOLD : story.status === "done" ? "" : DIM}${label}${NC}${suffix}`);
    }

    // Activity log
    if (this.activities.length > 0) {
      lines.push(`${GRAY}│${NC}`);
      lines.push(`${GRAY}├─${NC} ${DIM}Activity${NC}`);
      for (const a of this.activities) {
        const agentLabel = a.agent.padEnd(12);
        lines.push(`${GRAY}│${NC}  ${DIM}${a.time}${NC}  ${BLUE}${agentLabel}${NC} ${a.message}`);
      }
    }

    // Footer — elapsed time
    const elapsed = formatElapsed(Date.now() - this.startTime);
    lines.push(`${GRAY}└─${NC} ${DIM}${elapsed} elapsed${NC}`);

    // Erase previous render and draw new one
    if (this.lastLineCount > 0) {
      process.stderr.write(MOVE_UP(this.lastLineCount));
    }
    for (const line of lines) {
      process.stderr.write(`${CLEAR_LINE}${line}\n`);
    }
    // Clear any leftover lines from previous longer render
    if (lines.length < this.lastLineCount) {
      for (let i = 0; i < this.lastLineCount - lines.length; i++) {
        process.stderr.write(`${CLEAR_LINE}\n`);
      }
      process.stderr.write(MOVE_UP(this.lastLineCount - lines.length));
    }
    this.lastLineCount = lines.length;
  }

  /**
   * Final render — show cursor, print summary.
   */
  finish(run: WorkflowRun) {
    if (this.enabled) {
      process.stderr.write(SHOW_CURSOR);
    }
    this.render(run);

    const done = run.stories.filter(s => s.status === "done").length;
    const failed = run.stories.filter(s => s.status === "failed").length;
    const elapsed = formatElapsed(Date.now() - this.startTime);

    console.error("");
    if (run.status === "done") {
      console.error(`${GREEN}${BOLD}✅ Complete!${NC} ${done} stories in ${elapsed}. Branch: ${run.branch}`);
    } else {
      console.error(`${RED}${BOLD}❌ Failed.${NC} ${done} done, ${failed} failed in ${elapsed}. Branch: ${run.branch}`);
    }
  }
}

function storyIcon(story: Story): string {
  switch (story.status) {
    case "done": return `${GREEN}✅${NC}`;
    case "running": return `${CYAN}⏳${NC}`;
    case "failed": return `${RED}❌${NC}`;
    default: return `${GRAY}⬚${NC}`;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}
