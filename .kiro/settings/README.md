# MCP Settings

## mcp.json

Configures Model Context Protocol (MCP) servers that Kiro agents can use for tool access.

### Servers

| Server | Purpose | Package |
|--------|---------|---------|
| **filesystem** | Read/write project files | `@modelcontextprotocol/server-filesystem` |
| **git** | Commits, diffs, blame, log | `@modelcontextprotocol/server-git` |
| **github** | Issues, PRs, GitHub API | `@modelcontextprotocol/server-github` |

### Environment Variables

- `GITHUB_TOKEN` — Required for the `github` MCP server. Set this in your shell before running Kiro.

### Format

Each MCP server entry has:
- `name` — Identifier for the server
- `command` — Executable to run (typically `npx`)
- `args` — Arguments passed to the command
- `env` — Environment variables passed to the server process

### Customization

Copy `mcp.json` to your project's `.kiro/settings/` and modify paths or add additional MCP servers as needed.
