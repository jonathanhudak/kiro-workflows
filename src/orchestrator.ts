/**
 * Workflow Orchestrator — the public API.
 *
 * Usage:
 *   const wf = new WorkflowOrchestrator();
 *   await wf.run("feature-dev", "Add OAuth2 authentication");
 *
 * Internally: plans → loops through stories → verifies → tests → reviews → extracts learnings.
 * All Ralph loop artifacts are hidden from the user.
 */

import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { WorkflowRun, WorkflowType, Story, RunConfig, DEFAULT_CONFIG } from "./types.js";
import { WORKFLOWS } from "./workflows.js";
import { RalphLoop } from "./loop/ralph.js";
import { AgentRunner } from "./loop/agent-runner.js";
import { log, success, warn, error } from "./utils.js";
import { TerminalUI } from "./ui.js";

export class WorkflowOrchestrator {
  private config: RunConfig;
  private runner: AgentRunner;
  private stateDir: string;
  public ui: TerminalUI;

  constructor(config: Partial<RunConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runner = new AgentRunner(this.config);
    this.stateDir = join(this.config.projectDir, ".kiro", ".workflows");
    this.ui = new TerminalUI({ enabled: !config.verbose });
  }

  /**
   * Run a complete workflow end-to-end.
   */
  async run(workflow: WorkflowType, task: string): Promise<WorkflowRun> {
    const pipeline = WORKFLOWS[workflow];
    if (!pipeline) {
      throw new Error(`Unknown workflow: ${workflow}. Available: ${Object.keys(WORKFLOWS).join(", ")}`);
    }

    // Set up UI
    const stepNames = pipeline.steps.map(s => s.agent);
    this.ui.setPipeline(stepNames);
    this.ui.addActivity("orchestrator", `Starting ${workflow}`);

    // Create branch
    const branchName = `workflow/${workflow}/${Date.now()}`;
    this.gitCheckout(branchName);

    // Initialize run
    const run: WorkflowRun = {
      id: randomUUID().slice(0, 8),
      workflow,
      task,
      status: "planning",
      stories: [],
      branch: branchName,
      progress: [],
      learnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      iteration: 0,
      maxIterations: this.config.maxIterations,
    };

    this.saveState(run);
    this.ui.render(run);

    try {
      for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        this.ui.setCurrentStep(i);
        this.ui.addActivity(step.agent, `Starting ${step.role} step...`);
        this.ui.render(run);

        if (step.role === "plan") {
          await this.stepPlan(run, step.agent);
        } else if (step.loop) {
          await this.stepLoop(run, step);
        } else if (step.role === "compound") {
          await this.stepCompound(run, step.agent);
        } else {
          await this.stepSingle(run, step);
        }

        this.ui.addActivity(step.agent, `✅ ${step.role} complete`);
        this.saveState(run);
        this.ui.render(run);
      }

      run.status = "done";
    } catch (err: any) {
      run.status = "failed";
      const msg = err.message || String(err);
      this.ui.addActivity("orchestrator", `❌ ${msg.split("\n")[0]}`);
      this.ui.render(run);
      // Also print full error for debugging
      error(msg);
    }

    this.saveState(run);
    this.ui.finish(run);
    await this.runner.cleanup();
    return run;
  }

  /**
   * Planning step — agent breaks task into stories.
   */
  private async stepPlan(run: WorkflowRun, agent: string): Promise<void> {
    run.status = "planning";

    const prompt = `You are planning a development task. Break it into small, independent stories.

TASK: ${run.task}

Output ONLY a JSON array of stories in this exact format:
\`\`\`json
[
  {
    "id": "short-kebab-id",
    "title": "Brief title",
    "description": "What to implement",
    "acceptance_criteria": ["Criterion 1", "Criterion 2"]
  }
]
\`\`\`

Rules:
- Each story should be completable in one agent session
- Stories should be ordered by dependency (independent first)
- 3-10 stories is ideal
- Be specific in acceptance criteria`;

    const output = await this.runner.run(agent, prompt);

    // Parse stories from output
    const stories = this.parseStories(output);
    run.stories = stories;
    run.status = "running";

    log(`Planned ${stories.length} stories:`);
    stories.forEach((s) => log(`  - ${s.id}: ${s.title}`));
  }

  /**
   * Loop step — Ralph loop over stories with optional verification.
   */
  private async stepLoop(run: WorkflowRun, step: { agent: string; verifyEach?: boolean }): Promise<void> {
    const ralph = new RalphLoop(run, {
      ...this.config,
      verifyEach: step.verifyEach ?? this.config.verifyEach,
    }, this.ui);

    const result = await ralph.execute();

    // Merge result back
    run.stories = result.stories;
    run.progress = result.progress;
    run.iteration = result.iteration;
  }

  /**
   * Single step — run one agent, no loop.
   */
  private async stepSingle(run: WorkflowRun, step: { agent: string; role: string }): Promise<void> {
    const prompt = this.buildSinglePrompt(run, step);
    const output = await this.runner.run(step.agent, prompt);
    run.progress.push(`[${step.role}] ${step.agent}: completed`);
  }

  /**
   * Compound step — extract learnings and update steering.
   */
  private async stepCompound(run: WorkflowRun, agent: string): Promise<void> {
    const prompt = `Review the completed workflow and extract learnings.

TASK: ${run.task}
WORKFLOW: ${run.workflow}
STORIES COMPLETED: ${run.stories.filter((s) => s.status === "done").length}/${run.stories.length}
ITERATIONS USED: ${run.iteration}/${run.maxIterations}

PROGRESS LOG:
${run.progress.join("\n")}

Instructions:
1. Review git log for recent commits on this branch
2. Identify what worked well, what didn't, and surprises
3. Append learnings to .kiro/steering/learnings.md with today's date
4. Each learning should be: Context → Insight → Action

Keep learnings concise and actionable.`;

    const output = await this.runner.run(agent, prompt);
    run.learnings.push(output);
    run.progress.push(`[compound] Learnings extracted`);
  }

  private buildSinglePrompt(run: WorkflowRun, step: { agent: string; role: string }): string {
    const storyList = run.stories.map((s) => `- [${s.status === "done" ? "x" : " "}] ${s.title}`).join("\n");

    return `You are running the ${step.role} step of a ${run.workflow} workflow.

TASK: ${run.task}
BRANCH: ${run.branch}

STORIES:
${storyList}

PROGRESS:
${run.progress.join("\n")}

Do your job as the ${step.agent} agent. Review all changes and provide your output.`;
  }

  private parseStories(output: string): Story[] {
    // Strip markdown code fences if present
    const stripped = output.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

    // Find the outermost JSON array using bracket balancing
    const json = this.extractJsonArray(stripped);
    if (!json) {
      // Fallback: try greedy regex (last resort)
      const greedyMatch = stripped.match(/\[[\s\S]*\]/);
      if (!greedyMatch) {
        throw new Error(
          "Planner did not output a valid JSON story array. " +
          `Output starts with: "${output.slice(0, 200)}..."`
        );
      }
      return this.parseRawStories(greedyMatch[0]);
    }

    return this.parseRawStories(json);
  }

  private extractJsonArray(text: string): string | null {
    // Find first '[' and match to its balanced ']'
    const start = text.indexOf("[");
    if (start === -1) return null;

    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "[") depth++;
      else if (text[i] === "]") depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
    return null; // Unbalanced
  }

  private parseRawStories(jsonStr: string): Story[] {
    let raw: any[];
    try {
      raw = JSON.parse(jsonStr);
    } catch (e) {
      // Try fixing common LLM JSON issues: trailing commas
      const cleaned = jsonStr
        .replace(/,\s*]/g, "]")
        .replace(/,\s*}/g, "}");
      try {
        raw = JSON.parse(cleaned);
      } catch {
        throw new Error(
          `Failed to parse stories JSON. First 300 chars: "${jsonStr.slice(0, 300)}"`
        );
      }
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Planner output parsed but is not a non-empty array");
    }

    return raw.map((s: any) => ({
      id: s.id || s.story_id || `story-${Math.random().toString(36).slice(2, 6)}`,
      title: s.title || s.name || "Untitled story",
      description: s.description || "",
      acceptanceCriteria: s.acceptance_criteria || s.acceptanceCriteria || s.criteria || [],
      status: "pending" as const,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    }));
  }

  private gitCheckout(branch: string) {
    try {
      execSync(`git checkout -b ${branch}`, {
        cwd: this.config.projectDir,
        stdio: "pipe",
      });
    } catch {
      warn("Could not create branch — continuing on current branch");
    }
  }

  private saveState(run: WorkflowRun) {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
    writeFileSync(
      join(this.stateDir, `${run.id}.json`),
      JSON.stringify(run, null, 2)
    );
  }
}
