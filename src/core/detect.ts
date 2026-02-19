/**
 * Project detection — auto-detect project characteristics.
 *
 * Used by `spool init` to generate steering files and
 * by the orchestrator to provide project context.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface ProjectInfo {
  language: string;
  framework?: string;
  buildTool?: string;
  testFramework?: string;
  scripts: Record<string, string>;
  directories: string[];
}

/** Detect project characteristics from the filesystem. */
export function detectProject(projectDir: string): ProjectInfo {
  const info: ProjectInfo = {
    language: "unknown",
    scripts: {},
    directories: [],
  };

  // Top-level directory listing
  try {
    info.directories = readdirSync(projectDir, { withFileTypes: true })
      .filter(d => !d.name.startsWith(".") && d.name !== "node_modules" && d.name !== "dist" && d.name !== "__pycache__")
      .slice(0, 30)
      .map(d => d.name + (d.isDirectory() ? "/" : ""));
  } catch { /* skip */ }

  // Node.js / TypeScript
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

      info.language = deps["typescript"] ? "typescript" : "javascript";
      info.buildTool = deps["vite"] ? "vite" : deps["webpack"] ? "webpack" : deps["esbuild"] ? "esbuild" : "tsc";

      if (deps["react"]) info.framework = deps["next"] ? "next" : "react";
      else if (deps["vue"]) info.framework = deps["nuxt"] ? "nuxt" : "vue";
      else if (deps["svelte"]) info.framework = deps["@sveltejs/kit"] ? "sveltekit" : "svelte";
      else if (deps["express"]) info.framework = "express";
      else if (deps["fastify"]) info.framework = "fastify";
      else if (deps["hono"]) info.framework = "hono";

      if (deps["jest"]) info.testFramework = "jest";
      else if (deps["vitest"]) info.testFramework = "vitest";
      else if (deps["mocha"]) info.testFramework = "mocha";

      if (pkg.scripts) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          if (typeof cmd === "string") {
            info.scripts[name] = cmd;
          }
        }
      }
    } catch { /* skip */ }
    return info;
  }

  // Rust
  if (existsSync(join(projectDir, "Cargo.toml"))) {
    info.language = "rust";
    info.buildTool = "cargo";
    info.scripts = { build: "cargo build", test: "cargo test", lint: "cargo clippy" };
    return info;
  }

  // Go
  if (existsSync(join(projectDir, "go.mod"))) {
    info.language = "go";
    info.buildTool = "go";
    info.scripts = { build: "go build ./...", test: "go test ./..." };
    return info;
  }

  // Python
  if (existsSync(join(projectDir, "pyproject.toml")) || existsSync(join(projectDir, "setup.py"))) {
    info.language = "python";
    if (existsSync(join(projectDir, "pyproject.toml"))) {
      info.buildTool = "pyproject";
    }
    if (existsSync(join(projectDir, "pytest.ini")) || existsSync(join(projectDir, "conftest.py"))) {
      info.testFramework = "pytest";
    }
    return info;
  }

  return info;
}
