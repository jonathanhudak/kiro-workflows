/**
 * spool adapters
 *
 * List available adapters and their installation status.
 */

import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import { KiroAdapter } from "../adapters/kiro.js";
import { loadConfig } from "../config.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

export async function commandAdapters(): Promise<void> {
  const config = loadConfig(process.cwd());
  const currentAdapter = config.adapter || "claude-code";

  const adapters = [
    new ClaudeCodeAdapter(config.adapters?.["claude-code"]),
    new KiroAdapter(config.adapters?.kiro),
  ];

  console.log(`${BOLD}Available adapters:${NC}\n`);

  for (const adapter of adapters) {
    const status = await adapter.validate();
    const isDefault = adapter.name === currentAdapter;
    const defaultLabel = isDefault ? ` ${DIM}(default)${NC}` : "";
    const icon = status.installed ? `${GREEN}✓${NC}` : `${RED}✗${NC}`;
    const version = status.version ? ` ${DIM}${status.version}${NC}` : "";
    const statusText = status.installed ? `${GREEN}installed${NC}` : `${RED}not found${NC}`;

    console.log(`  ${adapter.name.padEnd(15)} ${icon} ${statusText}${version}${defaultLabel}`);
  }
  console.log();
}
