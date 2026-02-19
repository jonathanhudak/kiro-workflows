/**
 * Workflow Orchestrator — runs complete workflows end-to-end.
 *
 * Uses the adapter pattern for provider-agnostic execution.
 * Records all events to the JSONL task ledger.
 *
 * Usage:
 *   const orchestrator = new WorkflowOrchestrator(adapter, spoolConfig);
 *   await orchestrator.run("feature-dev", "Add OAuth2 authentication");
 */

import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { join } from "path";
import type { Adapter, SpoolConfig, WorkflowFormula, WorkflowStep, WorkflowRun, Story, RunConfig } from "./core/types.js";
import { DEFAULT_SPOOL_CONFIG, DEFAULT_CONFIG } from "./core/types.js";
import { Runner } from "./core/runner.js";
import { Ledger } from "./core/ledger.js";
import { parseStories } from "./core/story-parser.js";
import { loadWorkflow, discoverWorkflows } from "./config.js";
import { log, success, warn, error } from "./utils.js";
import { TerminalUI } from "./ui.js";

export class WorkflowOrchestrator {
  private legacyConfig: RunConfig;
  private spoolConfig: SpoolConfig;
  private runner: Runner;
  private ledger: Ledger;
  private projectDir: string;
  public ui: TerminalUI;

  constructor(adapter: Adapter, spoolConfig?: Partial<SpoolConfig>, legacyConfig?: Partial<RunConfig>) {
    this.legacyConfig = { ...DEFAULT_CONFIG, ...legacyConfig };
    this.spoolConfig = { ...DEFAULT_SPOOL_CONFIG, ...spoolConfig };
    this.projectDir = this.legacyConfig.projectDir;
    this.runner = new Runner(adapter, this.spoolConfig);
    this.ledger = new Ledger(join(this.projectDir, ".spool", "ledger.jsonl"));
    this.ui = new TerminalUI({ enabled: !this.legacyConfig.verbose });
  }

  /**
   * Run a complete workflow end-to-end.
   */
  async run(workflow: string, task: string): Promise<WorkflowRun> {
    const formula = this.loadFormula(workflow);

    const stepNames = formula.steps.map(s => s.agent);
    this.ui.setPipeline(stepNames);
    this.ui.addActivity("orchestrator", `Starting ${workflow}`);

    const branchName = `workflow/${workflow}/${Date.now()}`;
    this.gitCheckout(branchName);

    const runId = randomUUID().slice(0, 8);
    const run: WorkflowRun = {
      id: runId,
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
      maxIterations: this.legacyConfig.maxIterations,
    };

    this.ledger.append({
      type: "run_start",
      runId,
      workflow,
      adapter: this.spoolConfig.adapter,
      task,
      timestamp: new Date().toISOString(),
    });

    this.ui.render(run);

    try {
      for (let i = 0; i < formula.steps.length; i++) {
        const step = formula.steps[i];
        this.ui.setCurrentStep(i);
        this.ui.addActivity(step.agent, `Starting ${step.id}...`);
        this.ui.render(run);

        this.ledger.append({
          type: "step_start",
          runId,
          step: step.id,
          agent: step.agent,
          timestamp: new Date().toISOString(),
        });

        const stepStart = Date.now();

        if (this.isPlanStep(step, formula)) {
          await this.stepPlan(run, step);
        } else if (step.for_each) {
          await this.stepLoop(run, step);
        } else if (step.agent === "compound") {
          await this.stepCompound(run, step);
        } else {
          await this.stepSingle(run, step);
        }

        this.ledger.append({
          type: "step_complete",
          runId,
          step: step.id,
          status: "pass",
          durationMs: Date.now() - stepStart,
          timestamp: new Date().toISOString(),
        });

        this.ui.addActivity(step.agent, `${step.id} complete`);
        this.ui.render(run);
      }

      run.status = "done";
    } catch (err: unknown) {
      run.status = "failed";
      const msg = (err as Error).message || String(err);
      this.ui.addActivity("orchestrator", msg.split("\n")[0]);
      this.ui.render(run);
      error(msg);
    }

    this.ledger.append({
      type: "run_complete",
      runId,
      workflow,
      status: run.status === "done" ? "pass" : "fail",
      timestamp: new Date().toISOString(),
    });

    this.ui.finish(run);
    await this.runner.cleanup();
    return run;
  }

  private async stepPlan(run: WorkflowRun, step: WorkflowStep): Promise<void> {
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

    const output = await this.runner.runAgent(step.agent, prompt, this.projectDir, {
      runId: run.id,
      stepId: step.id,
    });

    const stories = parseStories(output, this.spoolConfig.loop?.max_retries ?? 3);
    run.stories = stories;
    run.status = "running";

    log(`Planned ${stories.length} stories:`);
    stories.forEach(s => log(`  - ${s.id}: ${s.title}`));
  }

  private async stepLoop(run: WorkflowRun, step: WorkflowStep): Promise<void> {
    const maxRetries = step.max_retries ?? this.spoolConfig.loop?.max_retries ?? 3;
    const maxIterations = this.legacyConfig.maxIterations;
    let iteration = 0;

    while (iteration < maxIterations) {
      const story = run.stories.find(s => s.status === "pending" || s.status === "running");
      if (!story) {
        success("All stories complete!");
        break;
      }

      iteration++;
      story.status = "running";
      run.iteration = iteration;

      this.ui.addActivity("loop", `Story: ${story.id} — ${story.title}`);
      this.ui.render(run);

      this.ledger.append({
        type: "loop_start",
        runId: run.id,
        step: step.id,
        storyId: story.id,
        attempt: story.retryCount + 1,
        timestamp: new Date().toISOString(),
      });

      const passed = await this.runStoryIteration(run, step, story, iteration);

      if (passed) {
        story.status = "done";
        story.verifyFeedback = undefined;
        run.progress.push(
          `## [${story.id}] ${story.title} — DONE (iteration ${iteration}) ${new Date().toISOString()}`
        );
        this.gitCommit(`feat(${story.id}): ${story.title}`);
        this.ui.addActivity("loop", `${story.id} done`);

        this.ledger.append({
          type: "loop_pass",
          runId: run.id,
          step: step.id,
          storyId: story.id,
          attempt: story.retryCount + 1,
          timestamp: new Date().toISOString(),
        });
      } else {
        story.retryCount++;
        if (story.retryCount >= maxRetries) {
          story.status = "failed";
          this.ui.addActivity("loop", `${story.id} failed after ${maxRetries} retries`);

          this.ledger.append({
            type: "loop_exhausted",
            runId: run.id,
            step: step.id,
            storyId: story.id,
            attempts: maxRetries,
            timestamp: new Date().toISOString(),
          });
        } else {
          story.status = "pending";
          this.ui.addActivity("verifier", `${story.id} retry ${story.retryCount}/${maxRetries}`);
          iteration--;

          this.ledger.append({
            type: "loop_fail",
            runId: run.id,
            step: step.id,
            storyId: story.id,
            attempt: story.retryCount,
            feedback: story.verifyFeedback || "Verification failed",
            timestamp: new Date().toISOString(),
          });
        }
      }

      run.updatedAt = new Date().toISOString();
      this.ui.render(run);
    }

    const remaining = run.stories.filter(s => s.status === "pending" || s.status === "running").length;
    if (remaining > 0) {
      run.status = "failed";
    }
  }

  private async runStoryIteration(
    run: WorkflowRun,
    step: WorkflowStep,
    story: Story,
    iteration: number
  ): Promise<boolean> {
    const completedSummary = run.stories
      .filter(s => s.status === "done")
      .map(s => `- [x] ${s.title}`)
      .join("\n");
    const remainingCount = run.stories.filter(s => s.status !== "done").length;

    const prompt = `You are implementing a single story in iteration ${iteration}. Focus ONLY on this story.

## Current Story: ${story.title}
ID: ${story.id}
Description: ${story.description}

### Acceptance Criteria:
${story.acceptanceCriteria.map(c => `- ${c}`).join("\n")}

### Progress: ${run.stories.filter(s => s.status === "done").length}/${run.stories.length} stories complete, ${remainingCount} remaining

### Completed Stories:
${completedSummary || "(none yet)"}

${story.verifyFeedback ? `### VERIFY FEEDBACK (fix these issues):\n${story.verifyFeedback}` : ""}

### Progress Log:
${run.progress.join("\n") || "(no previous progress)"}

## Instructions:
1. Read the codebase to understand current state
2. Implement ONLY this story
3. Run quality checks (build, lint, test)
4. If checks pass, commit with message: "feat(${story.id}): ${story.title}"
5. If checks fail, fix them

Do NOT work on other stories. Do NOT refactor unrelated code.`;

    this.ui.addActivity("developer", `Implementing ${story.id}...`);
    this.ui.render(run);

    await this.runner.runAgent(step.agent, prompt, this.projectDir, {
      runId: run.id,
      stepId: step.id,
      feedback: story.verifyFeedback,
    });

    if (!step.verifier) return true;

    this.ui.addActivity("verifier", `Verifying ${story.id}...`);
    this.ui.render(run);

    const verifyPrompt = `Verify that the following story has been correctly implemented.

## Story: ${story.title}
ID: ${story.id}

### Acceptance Criteria:
${story.acceptanceCriteria.map(c => `- ${c}`).join("\n")}

## Instructions:
1. Check each acceptance criterion
2. Run the test suite
3. Check the build succeeds

## Output Format:
Start your response with exactly one of:
- PASS: All criteria met
- FAIL: [list what failed]

Then provide details for each criterion:
- PASS: [criterion] — [evidence]
- FAIL: [criterion] — [what's wrong]`;

    const verifyOutput = await this.runner.runAgent(step.verifier, verifyPrompt, this.projectDir, {
      runId: run.id,
      stepId: `${step.id}-verify`,
    });

    const passed = /^PASS/im.test(verifyOutput.split("\n").slice(0, 5).join("\n"));
    if (!passed) {
      story.verifyFeedback = verifyOutput;
    }
    return passed;
  }

  private async stepSingle(run: WorkflowRun, step: WorkflowStep): Promise<void> {
    const storyList = run.stories.map(s =>
      `- [${s.status === "done" ? "x" : " "}] ${s.title}`
    ).join("\n");

    const prompt = `You are running the ${step.id} step of a ${run.workflow} workflow.

TASK: ${run.task}
BRANCH: ${run.branch}

STORIES:
${storyList}

PROGRESS:
${run.progress.join("\n")}

Do your job as the ${step.agent} agent. Review all changes and provide your output.`;

    await this.runner.runAgent(step.agent, prompt, this.projectDir, {
      runId: run.id,
      stepId: step.id,
    });
    run.progress.push(`[${step.id}] ${step.agent}: completed`);
  }

  private async stepCompound(run: WorkflowRun, step: WorkflowStep): Promise<void> {
    const prompt = `Review the completed workflow and extract learnings.

TASK: ${run.task}
WORKFLOW: ${run.workflow}
STORIES COMPLETED: ${run.stories.filter(s => s.status === "done").length}/${run.stories.length}
ITERATIONS USED: ${run.iteration}/${run.maxIterations}

PROGRESS LOG:
${run.progress.join("\n")}

Instructions:
1. Review git log for recent commits on this branch
2. Identify what worked well, what didn't, and surprises
3. Append learnings to .spool/steering/learnings.md with today's date
4. Each learning should be: Context -> Insight -> Action

Keep learnings concise and actionable.`;

    const output = await this.runner.runAgent(step.agent, prompt, this.projectDir, {
      runId: run.id,
      stepId: step.id,
    });
    run.learnings.push(output);
    run.progress.push(`[${step.id}] Learnings extracted`);

    this.ledger.append({
      type: "learning",
      runId: run.id,
      content: output.slice(0, 500),
      timestamp: new Date().toISOString(),
    });
  }

  private isPlanStep(step: WorkflowStep, formula: WorkflowFormula): boolean {
    return step === formula.steps[0] && !step.for_each && step.agent === "planner";
  }

  private loadFormula(workflow: string): WorkflowFormula {
    const spoolDir = join(this.projectDir, ".spool");
    const available = discoverWorkflows(spoolDir);

    if (available.includes(workflow)) {
      return loadWorkflow(spoolDir, workflow);
    }

    throw new Error(
      `Unknown workflow: ${workflow}. Available: ${available.join(", ")}`
    );
  }

  private gitCheckout(branch: string) {
    try {
      execSync(`git checkout -b ${branch}`, {
        cwd: this.projectDir,
        stdio: "pipe",
      });
    } catch {
      warn("Could not create branch — continuing on current branch");
    }
  }

  private gitCommit(message: string) {
    try {
      execSync(`git add -A && git commit -m "${message}" --allow-empty`, {
        cwd: this.projectDir,
        stdio: "pipe",
      });
    } catch {
      // Non-fatal
    }
  }
}
