#!/usr/bin/env node

/**
 * kiro-workflow CLI
 *
 * Usage:
 *   kiro-workflow run feature-dev "Add OAuth2 authentication"
 *   kiro-workflow run bug-fix "Fix login timeout on slow connections"
 *   kiro-workflow run security-audit "Audit auth module"
 *   kiro-workflow status
 *   kiro-workflow init
 */

import { WorkflowOrchestrator } from "./orchestrator.js";
import { WORKFLOWS } from "./workflows.js";
import { WorkflowType, RunConfig, DEFAULT_CONFIG } from "./types.js";
import { log, success, error } from "./utils.js";
import { existsSync, cpSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", ".kiro");

function printUsage() {
  console.log(`
kiro-workflow — Multi-agent development workflows for Kiro CLI

USAGE:
  kiro-workflow run <workflow> "<task description>"
  kiro-workflow init [--dir <path>]
  kiro-workflow setup [--global] [--mcp] [--agents] [--steering]
  kiro-workflow status
  kiro-workflow list

WORKFLOWS:
  feature-dev      Plan, implement, test, and review a feature
  bug-fix          Triage, investigate, fix, and verify a bug
  security-audit   Scan, prioritize, fix, and test security issues

OPTIONS:
  --acp            Use ACP protocol (persistent process, faster)
  --max-iter <n>   Max iterations (default: 15)
  --no-verify      Skip verification after each story
  --verbose        Show detailed output

SETUP:
  --global         Install to ~/.kiro/ (available in all projects)
  --mcp            Configure MCP servers only
  --agents         Configure agents only
  --steering       Configure steering files only
  --detect         Auto-detect project stack and generate steering

EXAMPLES:
  kiro-workflow run feature-dev "Add user authentication with OAuth2"
  kiro-workflow run bug-fix "Fix: login form submits twice on slow connections"
  kiro-workflow run security-audit "Audit the API authentication module"
  kiro-workflow init                # Copy .kiro/ agents + steering into current project
  kiro-workflow setup               # Auto-configure everything for current project
  kiro-workflow setup --global      # Install agents + MCP globally to ~/.kiro/
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "run":
      await commandRun(args.slice(1));
      break;
    case "init":
      commandInit(args.slice(1));
      break;
    case "setup":
      commandSetup(args.slice(1));
      break;
    case "list":
      commandList();
      break;
    case "status":
      commandStatus();
      break;
    default:
      error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

async function commandRun(args: string[]) {
  // Parse args
  const config: Partial<RunConfig> = {};
  let workflow: string | undefined;
  let task: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--acp":
        config.useAcp = true;
        break;
      case "--max-iter":
        config.maxIterations = parseInt(args[++i]);
        break;
      case "--no-verify":
        config.verifyEach = false;
        break;
      case "--verbose":
        config.verbose = true;
        break;
      default:
        if (!workflow) {
          workflow = args[i];
        } else if (!task) {
          task = args[i];
        }
    }
  }

  if (!workflow || !task) {
    error("Usage: kiro-workflow run <workflow> \"<task>\"");
    process.exit(1);
  }

  if (!WORKFLOWS[workflow as WorkflowType]) {
    error(`Unknown workflow: ${workflow}`);
    error(`Available: ${Object.keys(WORKFLOWS).join(", ")}`);
    process.exit(1);
  }

  // Check for .kiro/agents
  if (!existsSync(join(process.cwd(), ".kiro", "agents"))) {
    error("No .kiro/agents/ found. Run 'kiro-workflow init' first.");
    process.exit(1);
  }

  const orchestrator = new WorkflowOrchestrator(config);
  const result = await orchestrator.run(workflow as WorkflowType, task);

  // Print summary
  console.log(`\nRun: ${result.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Stories: ${result.stories.filter((s) => s.status === "done").length}/${result.stories.length}`);
  console.log(`Branch: ${result.branch}`);

  process.exit(result.status === "done" ? 0 : 1);
}

function commandInit(args: string[]) {
  const targetDir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : process.cwd();
  const kiroDir = join(targetDir, ".kiro");

  if (existsSync(join(kiroDir, "agents"))) {
    log(".kiro/agents/ already exists. Merging new agents...");
  }

  if (!existsSync(ASSETS_DIR)) {
    error("Asset directory not found. Reinstall kiro-workflows.");
    process.exit(1);
  }

  cpSync(ASSETS_DIR, kiroDir, { recursive: true, force: false });
  success(`✅ Initialized .kiro/ in ${targetDir}`);
  log("Agents: " + readdirSync(join(kiroDir, "agents")).filter(f => f.endsWith(".json")).join(", "));
  log("Steering: " + readdirSync(join(kiroDir, "steering")).join(", "));
  log("\nCustomize steering files for your project:");
  log("  .kiro/steering/structure.md — your codebase layout");
  log("  .kiro/steering/tech.md — your tech stack");
  log("  .kiro/steering/product.md — your business context");
}

function commandSetup(args: string[]) {
  const isGlobal = args.includes("--global");
  const mcpOnly = args.includes("--mcp");
  const agentsOnly = args.includes("--agents");
  const steeringOnly = args.includes("--steering");
  const autoDetect = args.includes("--detect") || (!mcpOnly && !agentsOnly && !steeringOnly);
  const all = !mcpOnly && !agentsOnly && !steeringOnly;

  const targetDir = isGlobal
    ? join(process.env.HOME || "~", ".kiro")
    : join(process.cwd(), ".kiro");

  const targetLabel = isGlobal ? "~/.kiro (global)" : `.kiro/ (${process.cwd()})`;

  log(`Setting up Kiro workflows in ${targetLabel}`);

  // Ensure directories
  for (const dir of ["agents", "steering", "settings", "hooks"]) {
    const p = join(targetDir, dir);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  // --- Agents ---
  if (all || agentsOnly) {
    const agentsSrc = join(ASSETS_DIR, "agents");
    if (existsSync(agentsSrc)) {
      const agents = readdirSync(agentsSrc).filter(f => f.endsWith(".json"));
      for (const agent of agents) {
        const dest = join(targetDir, "agents", agent);
        const exists = existsSync(dest);
        cpSync(join(agentsSrc, agent), dest, { force: false });
        if (!exists) {
          log(`  + agents/${agent}`);
        } else {
          log(`  · agents/${agent} (exists, skipped)`);
        }
      }
      success(`${agents.length} agents configured`);
    }
  }

  // --- MCP Servers ---
  if (all || mcpOnly) {
    const mcpDest = join(targetDir, "settings", "mcp.json");
    const mcpSrc = join(ASSETS_DIR, "settings", "mcp.json");

    if (existsSync(mcpDest)) {
      // Merge: add any new servers without overwriting existing
      try {
        const existing = JSON.parse(readFileSync(mcpDest, "utf-8"));
        const template = JSON.parse(readFileSync(mcpSrc, "utf-8"));
        let added = 0;
        for (const [name, config] of Object.entries(template.mcpServers || {})) {
          if (!existing.mcpServers?.[name]) {
            existing.mcpServers = existing.mcpServers || {};
            (existing.mcpServers as Record<string, unknown>)[name] = config;
            log(`  + mcp: ${name}`);
            added++;
          } else {
            log(`  · mcp: ${name} (exists, skipped)`);
          }
        }
        if (added > 0) {
          writeFileSync(mcpDest, JSON.stringify(existing, null, 2) + "\n");
        }
        success(`MCP servers configured (${added} new)`);
      } catch {
        cpSync(mcpSrc, mcpDest);
        success("MCP servers configured (fresh install)");
      }
    } else {
      cpSync(mcpSrc, mcpDest);
      success("MCP servers configured");
    }

    // Detect additional MCP servers based on project
    if (autoDetect) {
      const detected = detectMcpServers(process.cwd());
      if (detected.length > 0) {
        const mcpConfig = JSON.parse(readFileSync(mcpDest, "utf-8"));
        for (const server of detected) {
          if (!mcpConfig.mcpServers?.[server.name]) {
            mcpConfig.mcpServers[server.name] = server.config;
            log(`  + mcp: ${server.name} (auto-detected)`);
          }
        }
        writeFileSync(mcpDest, JSON.stringify(mcpConfig, null, 2) + "\n");
      }
    }
  }

  // --- Steering ---
  if (all || steeringOnly) {
    const steeringSrc = join(ASSETS_DIR, "steering");
    if (existsSync(steeringSrc)) {
      const files = readdirSync(steeringSrc);
      for (const file of files) {
        const dest = join(targetDir, "steering", file);
        if (!existsSync(dest)) {
          cpSync(join(steeringSrc, file), dest);
          log(`  + steering/${file}`);
        } else {
          log(`  · steering/${file} (exists, skipped)`);
        }
      }
    }

    // Auto-detect and generate project-specific steering
    if (autoDetect && !isGlobal) {
      generateSteering(process.cwd(), targetDir);
    }

    success("Steering files configured");
  }

  // --- Hooks ---
  if (all) {
    const hooksSrc = join(ASSETS_DIR, "hooks");
    if (existsSync(hooksSrc)) {
      const hooks = readdirSync(hooksSrc);
      for (const hook of hooks) {
        const dest = join(targetDir, "hooks", hook);
        if (!existsSync(dest)) {
          cpSync(join(hooksSrc, hook), dest);
          log(`  + hooks/${hook}`);
        }
      }
    }
  }

  console.log("");
  success(`✅ Setup complete: ${targetLabel}`);

  if (isGlobal) {
    log("Agents and MCP servers are now available in all projects.");
    log("Use 'kiro-workflow setup' (without --global) in a project to add steering.");
  } else {
    log("Next steps:");
    log("  1. Review .kiro/steering/structure.md and .kiro/steering/tech.md");
    log("  2. Run: kiro-workflow run feature-dev \"Your task here\"");
  }
}

interface DetectedMcp {
  name: string;
  config: Record<string, unknown>;
}

function detectMcpServers(projectDir: string): DetectedMcp[] {
  const detected: DetectedMcp[] = [];

  // Postgres/DB
  if (
    existsSync(join(projectDir, "prisma")) ||
    existsSync(join(projectDir, "drizzle.config.ts")) ||
    existsSync(join(projectDir, "knexfile.js"))
  ) {
    detected.push({
      name: "postgres",
      config: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { DATABASE_URL: "${DATABASE_URL}" },
      },
    });
  }

  // Docker
  if (existsSync(join(projectDir, "docker-compose.yml")) || existsSync(join(projectDir, "Dockerfile"))) {
    detected.push({
      name: "docker",
      config: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-docker"],
        env: {},
      },
    });
  }

  // AWS (CDK / SAM / CloudFormation)
  if (
    existsSync(join(projectDir, "cdk.json")) ||
    existsSync(join(projectDir, "template.yaml")) ||
    existsSync(join(projectDir, "samconfig.toml"))
  ) {
    detected.push({
      name: "aws",
      config: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-aws"],
        env: {},
      },
    });
  }

  // Puppeteer / browser testing
  if (existsSync(join(projectDir, "playwright.config.ts")) || existsSync(join(projectDir, "cypress.config.ts"))) {
    detected.push({
      name: "puppeteer",
      config: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-puppeteer"],
        env: {},
      },
    });
  }

  // Slack
  if (existsSync(join(projectDir, "slack.json")) || existsSync(join(projectDir, ".slack"))) {
    detected.push({
      name: "slack",
      config: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
      },
    });
  }

  return detected;
}

function generateSteering(projectDir: string, kiroDir: string) {
  // Auto-detect tech stack
  const techLines: string[] = ["# Tech Stack\n", "*Auto-generated by kiro-workflow setup*\n"];
  const structLines: string[] = ["# Project Structure\n", "*Auto-generated by kiro-workflow setup*\n"];

  // Package.json detection
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

      techLines.push("## Stack\n");
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps["react"]) techLines.push("- React" + (deps["next"] ? " (Next.js)" : ""));
      if (deps["vue"]) techLines.push("- Vue");
      if (deps["angular"]) techLines.push("- Angular");
      if (deps["express"]) techLines.push("- Express");
      if (deps["fastify"]) techLines.push("- Fastify");
      if (deps["hono"]) techLines.push("- Hono");
      if (deps["prisma"]) techLines.push("- Prisma ORM");
      if (deps["drizzle-orm"]) techLines.push("- Drizzle ORM");
      if (deps["typescript"]) techLines.push("- TypeScript");
      if (deps["tailwindcss"]) techLines.push("- Tailwind CSS");
      if (deps["jest"]) techLines.push("- Jest (testing)");
      if (deps["vitest"]) techLines.push("- Vitest (testing)");
      if (deps["mocha"]) techLines.push("- Mocha (testing)");
      if (deps["playwright"]) techLines.push("- Playwright (e2e)");
      if (deps["cypress"]) techLines.push("- Cypress (e2e)");

      techLines.push("\n## Scripts\n");
      if (pkg.scripts) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          if (["build", "dev", "start", "test", "lint", "format", "typecheck"].includes(name)) {
            techLines.push(`- \`npm run ${name}\`: \`${cmd}\``);
          }
        }
      }
    } catch { /* skip */ }
  }

  // Cargo.toml (Rust)
  if (existsSync(join(projectDir, "Cargo.toml"))) {
    techLines.push("## Stack\n", "- Rust", "- Cargo\n");
    techLines.push("## Scripts\n", "- `cargo build`: Build", "- `cargo test`: Test", "- `cargo clippy`: Lint");
  }

  // Go
  if (existsSync(join(projectDir, "go.mod"))) {
    techLines.push("## Stack\n", "- Go\n");
    techLines.push("## Scripts\n", "- `go build ./...`: Build", "- `go test ./...`: Test");
  }

  // Python
  if (existsSync(join(projectDir, "pyproject.toml")) || existsSync(join(projectDir, "setup.py"))) {
    techLines.push("## Stack\n", "- Python\n");
    if (existsSync(join(projectDir, "pyproject.toml"))) {
      techLines.push("- pyproject.toml based");
    }
  }

  // Directory structure
  try {
    const topLevel = readdirSync(projectDir, { withFileTypes: true })
      .filter(d => !d.name.startsWith(".") && d.name !== "node_modules" && d.name !== "dist" && d.name !== "__pycache__")
      .slice(0, 20);

    structLines.push("## Directory Layout\n", "```");
    for (const entry of topLevel) {
      const suffix = entry.isDirectory() ? "/" : "";
      structLines.push(`${entry.name}${suffix}`);
    }
    structLines.push("```");
  } catch { /* skip */ }

  // Write generated files
  const techDest = join(kiroDir, "steering", "tech.md");
  const structDest = join(kiroDir, "steering", "structure.md");

  if (techLines.length > 3) {
    writeFileSync(techDest, techLines.join("\n") + "\n");
    log("  ✨ steering/tech.md (auto-generated from project)");
  }
  if (structLines.length > 3) {
    writeFileSync(structDest, structLines.join("\n") + "\n");
    log("  ✨ steering/structure.md (auto-generated from project)");
  }
}

function commandList() {
  console.log("Available workflows:\n");
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    console.log(`  ${name}`);
    console.log(`    ${wf.description}`);
    console.log(`    Pipeline: ${wf.steps.map((s) => s.agent).join(" → ")}`);
    console.log();
  }
}

function commandStatus() {
  const stateDir = join(process.cwd(), ".kiro", ".workflows");
  if (!existsSync(stateDir)) {
    log("No workflow runs found.");
    return;
  }

  const files = readdirSync(stateDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    log("No workflow runs found.");
    return;
  }

  for (const file of files.slice(-5)) {
    try {
      const run = JSON.parse(require("fs").readFileSync(join(stateDir, file), "utf-8"));
      const done = run.stories?.filter((s: any) => s.status === "done").length || 0;
      const total = run.stories?.length || 0;
      console.log(`  ${run.id}  ${run.workflow}  ${run.status}  ${done}/${total} stories  ${run.branch}`);
    } catch {
      // skip corrupt files
    }
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
