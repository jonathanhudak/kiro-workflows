/**
 * Shared utilities for CLI commands.
 */

import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import { KiroAdapter } from "../adapters/kiro.js";
import { error } from "../utils.js";
import type { Adapter, SpoolConfig } from "../core/types.js";

export function resolveAdapter(config: SpoolConfig, useAcp?: boolean): Adapter {
  const adapterName = config.adapter || "claude-code";
  const adapterConfig = config.adapters?.[adapterName];

  switch (adapterName) {
    case "claude-code":
      return new ClaudeCodeAdapter(adapterConfig);
    case "kiro":
      return new KiroAdapter({ ...adapterConfig, useAcp });
    default:
      error(`Unknown adapter: ${adapterName}. Available: claude-code, kiro`);
      process.exit(1);
  }
}
