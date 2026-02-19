/**
 * LearningsManager — reads and injects learnings into agent context.
 *
 * Learnings are stored in .spool/steering/learnings.md.
 * When learnings.inject is true, the file content is prepended
 * to every agent's steering context automatically.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import type { LearningsConfig } from "./types.js";

const LEARNINGS_FILE = "steering/learnings.md";

export class LearningsManager {
  private spoolDir: string;
  private config: LearningsConfig;

  constructor(spoolDir: string, config: LearningsConfig = {}) {
    this.spoolDir = spoolDir;
    this.config = config;
  }

  /** Read the full learnings file, or empty string if missing. */
  read(): string {
    const path = join(this.spoolDir, LEARNINGS_FILE);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf-8");
  }

  /** Append a new learning entry with timestamp. */
  append(entry: string): void {
    const path = join(this.spoolDir, LEARNINGS_FILE);
    const timestamp = new Date().toISOString().slice(0, 10);
    const block = `\n## ${timestamp}\n\n${entry.trim()}\n`;
    appendFileSync(path, block, "utf-8");
  }

  /** Whether learnings should be injected into agent context. */
  get shouldInject(): boolean {
    return this.config.inject !== false;
  }

  /** Whether learnings should be auto-extracted after runs. */
  get shouldAutoExtract(): boolean {
    return this.config.auto !== false;
  }

  /** Get learnings content formatted for injection, or undefined if disabled/empty. */
  getInjectable(): string | undefined {
    if (!this.shouldInject) return undefined;
    const content = this.read();
    if (!content.trim()) return undefined;
    return content;
  }
}
