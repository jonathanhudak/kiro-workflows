/**
 * The Ralph Loop — autonomous agent loop for Kiro CLI.
 *
 * Each iteration:
 * 1. Pick the next incomplete story
 * 2. Spawn a fresh agent session (clean context)
 * 3. Agent implements the story
 * 4. Verifier checks acceptance criteria
 * 5. If fail → retry with feedback. If pass → next story.
 * 6. After all stories → run compound agent for learnings.
 *
 * Memory persists ONLY through:
 * - Git history (commits from previous iterations)
 * - Progress log (append-only learnings)
 * - Story status (in-memory, tracked by this runner)
 */

import { execSync } from "child_process";
import { Story, WorkflowRun, RunConfig, DEFAULT_CONFIG } from "../types.js";
import { AgentRunner } from "./agent-runner.js";
import { log, success, warn, error } from "../utils.js";
import { TerminalUI } from "../ui.js";

export class RalphLoop {
  private runner: AgentRunner;
  private config: RunConfig;
  private run: WorkflowRun;
  public ui?: TerminalUI;

  constructor(run: WorkflowRun, config: Partial<RunConfig> = {}, ui?: TerminalUI) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.run = run;
    this.runner = new AgentRunner(this.config);
    this.ui = ui;
  }

  /**
   * Execute the story loop. Returns when all stories are done or max iterations hit.
   */
  async execute(): Promise<WorkflowRun> {
    log(`🐿️ Ralph loop starting`);
    log(`Task: ${this.run.task}`);
    log(`Stories: ${this.countDone()}/${this.run.stories.length}`);
    log(`Max iterations: ${this.config.maxIterations}`);

    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      const story = this.getNextStory();
      if (!story) {
        success("🎉 All stories complete!");
        break;
      }

      iteration++;
      story.status = "running";
      this.run.iteration = iteration;

      this.ui?.addActivity("ralph", `Story: ${story.id} — ${story.title}`);
      this.ui?.render(this.run);

      const passed = await this.runStoryIteration(story, iteration);

      if (passed) {
        story.status = "done";
        story.verifyFeedback = undefined;
        this.appendProgress(story, iteration);
        this.gitCommit(`feat(${story.id}): ${story.title}`);
        this.ui?.addActivity("ralph", `✅ ${story.id} done`);
      } else {
        story.retryCount++;
        if (story.retryCount >= story.maxRetries) {
          story.status = "failed";
          this.ui?.addActivity("ralph", `❌ ${story.id} failed after ${story.maxRetries} retries`);
        } else {
          story.status = "pending";
          this.ui?.addActivity("verifier", `↩ ${story.id} retry ${story.retryCount}/${story.maxRetries}`);
          iteration--;
        }
      }

      this.run.updatedAt = new Date().toISOString();
      this.ui?.render(this.run);
    }

    // Final status
    this.run.status = this.countRemaining() === 0 ? "done" : "failed";
    return this.run;
  }

  private async runStoryIteration(story: Story, iteration: number): Promise<boolean> {
    // Build developer prompt
    const prompt = this.buildImplementPrompt(story, iteration);

    // Run developer agent (fresh session)
    this.ui?.addActivity("developer", `Implementing ${story.id}...`);
    this.ui?.render(this.run);
    const devOutput = await this.runner.run("developer", prompt);

    if (!this.config.verifyEach) {
      return true; // No verification, assume success
    }

    // Run verifier agent (fresh session)
    this.ui?.addActivity("verifier", `Verifying ${story.id}...`);
    this.ui?.render(this.run);
    const verifyPrompt = this.buildVerifyPrompt(story);
    const verifyOutput = await this.runner.run("verifier", verifyPrompt);

    // Parse verification result
    const passed = this.parseVerifyResult(verifyOutput);
    if (!passed) {
      story.verifyFeedback = verifyOutput;
    }
    return passed;
  }

  private buildImplementPrompt(story: Story, iteration: number): string {
    const completedSummary = this.run.stories
      .filter((s) => s.status === "done")
      .map((s) => `- [x] ${s.title}`)
      .join("\n");

    const remainingCount = this.countRemaining();
    const progressLog = this.run.progress.join("\n");

    return `You are implementing a single story in iteration ${iteration}. Focus ONLY on this story.

## Current Story: ${story.title}
ID: ${story.id}
Description: ${story.description}

### Acceptance Criteria:
${story.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

### Progress: ${this.countDone()}/${this.run.stories.length} stories complete, ${remainingCount} remaining

### Completed Stories:
${completedSummary || "(none yet)"}

${story.verifyFeedback ? `### VERIFY FEEDBACK (fix these issues):\n${story.verifyFeedback}` : ""}

### Progress Log:
${progressLog || "(no previous progress)"}

## Instructions:
1. Read the codebase to understand current state
2. Implement ONLY this story
3. Run quality checks (build, lint, test)
4. If checks pass, commit with message: "feat(${story.id}): ${story.title}"
5. If checks fail, fix them

Do NOT work on other stories. Do NOT refactor unrelated code.`;
  }

  private buildVerifyPrompt(story: Story): string {
    return `Verify that the following story has been correctly implemented.

## Story: ${story.title}
ID: ${story.id}

### Acceptance Criteria:
${story.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

## Instructions:
1. Check each acceptance criterion
2. Run the test suite
3. Check the build succeeds

## Output Format:
Start your response with exactly one of:
- PASS: All criteria met
- FAIL: [list what failed]

Then provide details for each criterion:
- ✅ PASS: [criterion] — [evidence]
- ❌ FAIL: [criterion] — [what's wrong]`;
  }

  private parseVerifyResult(output: string): boolean {
    const firstLines = output.split("\n").slice(0, 5).join("\n");
    return /^PASS/im.test(firstLines);
  }

  private getNextStory(): Story | undefined {
    return this.run.stories.find((s) => s.status === "pending" || s.status === "running");
  }

  private countDone(): number {
    return this.run.stories.filter((s) => s.status === "done").length;
  }

  private countRemaining(): number {
    return this.run.stories.filter((s) => s.status !== "done").length;
  }

  private appendProgress(story: Story, iteration: number) {
    this.run.progress.push(
      `## [${story.id}] ${story.title} — DONE (iteration ${iteration}) ${new Date().toISOString()}`
    );
  }

  private gitCommit(message: string) {
    try {
      execSync(`git add -A && git commit -m "${message}" --allow-empty`, {
        cwd: this.config.projectDir,
        stdio: "pipe",
      });
    } catch {
      // Non-fatal — maybe nothing to commit
    }
  }
}
