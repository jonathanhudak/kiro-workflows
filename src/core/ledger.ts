/**
 * Task Ledger — append-only JSONL event log.
 *
 * Records workflow runs, step transitions, Ralph loop iterations,
 * and learnings. Stored at .spool/ledger.jsonl, tracked in git.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { LedgerEvent } from "./types.js";

export class Ledger {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  append(event: LedgerEvent): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(this.filePath, JSON.stringify(event) + "\n");
  }

  read(): LedgerEvent[] {
    if (!existsSync(this.filePath)) return [];
    const content = readFileSync(this.filePath, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map(line => JSON.parse(line) as LedgerEvent);
  }

  getRunEvents(runId: string): LedgerEvent[] {
    return this.read().filter(e => e.runId === runId);
  }

  getLatestRunId(): string | null {
    const events = this.read();
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "run_start") {
        return events[i].runId;
      }
    }
    return null;
  }

  getRuns(): Array<{ runId: string; workflow: string; status: string; timestamp: string }> {
    const events = this.read();
    const runs = new Map<string, { runId: string; workflow: string; status: string; timestamp: string }>();

    for (const event of events) {
      if (event.type === "run_start") {
        runs.set(event.runId, {
          runId: event.runId,
          workflow: event.workflow,
          status: "running",
          timestamp: event.timestamp,
        });
      } else if (event.type === "run_complete") {
        const run = runs.get(event.runId);
        if (run) {
          run.status = event.status;
        }
      }
    }

    return [...runs.values()];
  }
}
