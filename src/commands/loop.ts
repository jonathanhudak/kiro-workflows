/**
 * spool loop <agent> <verifier> [--max-retries N]
 *
 * Run the raw Ralph loop without a full workflow.
 * Useful for one-off implementation tasks.
 */

import { join } from "path";
import { Runner } from "../core/runner.js";
import { loadConfig } from "../config.js";
import { resolveAdapter } from "./shared.js";
import { error, log, success } from "../utils.js";
import type { Story } from "../core/types.js";

export async function commandLoop(args: string[]): Promise<void> {
  let agent: string | undefined;
  let verifier: string | undefined;
  let maxRetries = 3;
  let task: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--max-retries":
        maxRetries = parseInt(args[++i]);
        break;
      case "--task":
        task = args[++i];
        break;
      default:
        if (!agent) {
          agent = args[i];
        } else if (!verifier) {
          verifier = args[i];
        }
    }
  }

  if (!agent || !verifier) {
    error("Usage: spool loop <agent> <verifier> --task \"<task>\"");
    process.exit(1);
  }

  if (!task) {
    error("Provide a task with --task \"<task description>\"");
    process.exit(1);
  }

  const spoolConfig = loadConfig(process.cwd());
  const adapter = resolveAdapter(spoolConfig);
  const runner = new Runner(adapter, spoolConfig);

  log(`Ralph loop: ${agent} + ${verifier} (max retries: ${maxRetries})`);

  // Simple single-story loop for standalone use
  const story: Story = {
    id: "task-1",
    title: task,
    description: task,
    acceptanceCriteria: [`Task completed: ${task}`],
    status: "pending",
    retryCount: 0,
    maxRetries,
  };

  let attempt = 0;
  while (attempt <= maxRetries && story.status !== "done") {
    attempt++;
    story.status = "running";
    log(`Attempt ${attempt}/${maxRetries + 1}`);

    const prompt = `Implement the following task:

TASK: ${story.title}

${story.verifyFeedback ? `PREVIOUS FEEDBACK:\n${story.verifyFeedback}` : ""}

Complete the task and ensure all acceptance criteria are met.`;

    await runner.runAgent(agent, prompt, process.cwd());

    const verifyPrompt = `Verify the following task was completed:

TASK: ${story.title}

Start your response with PASS or FAIL.`;

    const result = await runner.runAgent(verifier, verifyPrompt, process.cwd());
    const passed = /^PASS/im.test(result.split("\n").slice(0, 5).join("\n"));

    if (passed) {
      story.status = "done";
      success(`Task completed on attempt ${attempt}`);
    } else {
      story.verifyFeedback = result;
      log(`Failed verification, retry ${attempt}/${maxRetries + 1}`);
    }
  }

  if (story.status !== "done") {
    error(`Task failed after ${attempt} attempts`);
    process.exit(1);
  }

  await runner.cleanup();
}
