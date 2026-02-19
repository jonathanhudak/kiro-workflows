import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Ledger } from "../core/ledger.js";
import type { LedgerEvent } from "../core/types.js";

describe("Ledger", () => {
  let tmpDir: string;
  let ledger: Ledger;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "spool-test-"));
    ledger = new Ledger(join(tmpDir, "ledger.jsonl"));
  });

  it("reads empty ledger", () => {
    const events = ledger.read();
    assert.deepEqual(events, []);
  });

  it("appends and reads events", () => {
    const event: LedgerEvent = {
      type: "run_start",
      runId: "test-001",
      workflow: "feature-dev",
      adapter: "claude-code",
      task: "Add dark mode",
      timestamp: "2025-02-17T10:00:00Z",
    };
    ledger.append(event);

    const events = ledger.read();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "run_start");
    assert.equal(events[0].runId, "test-001");
  });

  it("appends multiple events", () => {
    ledger.append({
      type: "run_start",
      runId: "test-001",
      workflow: "feature-dev",
      adapter: "claude-code",
      task: "Test task",
      timestamp: "2025-02-17T10:00:00Z",
    });
    ledger.append({
      type: "step_start",
      runId: "test-001",
      step: "plan",
      agent: "planner",
      timestamp: "2025-02-17T10:00:05Z",
    });
    ledger.append({
      type: "step_complete",
      runId: "test-001",
      step: "plan",
      status: "pass",
      durationMs: 45000,
      timestamp: "2025-02-17T10:00:50Z",
    });

    const events = ledger.read();
    assert.equal(events.length, 3);
  });

  it("filters events by runId", () => {
    ledger.append({
      type: "run_start",
      runId: "run-a",
      workflow: "feature-dev",
      adapter: "claude-code",
      task: "Task A",
      timestamp: "2025-02-17T10:00:00Z",
    });
    ledger.append({
      type: "run_start",
      runId: "run-b",
      workflow: "bug-fix",
      adapter: "kiro",
      task: "Task B",
      timestamp: "2025-02-17T11:00:00Z",
    });
    ledger.append({
      type: "step_start",
      runId: "run-a",
      step: "plan",
      agent: "planner",
      timestamp: "2025-02-17T10:00:05Z",
    });

    const runAEvents = ledger.getRunEvents("run-a");
    assert.equal(runAEvents.length, 2);

    const runBEvents = ledger.getRunEvents("run-b");
    assert.equal(runBEvents.length, 1);
  });

  it("gets latest run id", () => {
    ledger.append({
      type: "run_start",
      runId: "run-1",
      workflow: "feature-dev",
      adapter: "claude-code",
      task: "First",
      timestamp: "2025-02-17T10:00:00Z",
    });
    ledger.append({
      type: "run_start",
      runId: "run-2",
      workflow: "bug-fix",
      adapter: "kiro",
      task: "Second",
      timestamp: "2025-02-17T11:00:00Z",
    });

    assert.equal(ledger.getLatestRunId(), "run-2");
  });

  it("returns null for latest run on empty ledger", () => {
    assert.equal(ledger.getLatestRunId(), null);
  });

  it("lists all runs with status", () => {
    ledger.append({
      type: "run_start",
      runId: "run-1",
      workflow: "feature-dev",
      adapter: "claude-code",
      task: "First",
      timestamp: "2025-02-17T10:00:00Z",
    });
    ledger.append({
      type: "run_complete",
      runId: "run-1",
      workflow: "feature-dev",
      status: "pass",
      timestamp: "2025-02-17T10:30:00Z",
    });
    ledger.append({
      type: "run_start",
      runId: "run-2",
      workflow: "bug-fix",
      adapter: "kiro",
      task: "Second",
      timestamp: "2025-02-17T11:00:00Z",
    });

    const runs = ledger.getRuns();
    assert.equal(runs.length, 2);
    assert.equal(runs[0].status, "pass");
    assert.equal(runs[1].status, "running");
  });

  // Cleanup
  it("cleanup tmp dir", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
