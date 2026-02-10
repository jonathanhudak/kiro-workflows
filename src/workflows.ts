import { WorkflowPipeline, WorkflowType } from "./types.js";

export const WORKFLOWS: Record<WorkflowType, WorkflowPipeline> = {
  "feature-dev": {
    name: "feature-dev",
    description: "Plan, implement, verify, test, and review a new feature",
    steps: [
      { agent: "planner", role: "plan" },
      { agent: "developer", role: "implement", loop: true, verifyEach: true },
      { agent: "tester", role: "test" },
      { agent: "reviewer", role: "review" },
      { agent: "compound", role: "compound" },
    ],
  },
  "bug-fix": {
    name: "bug-fix",
    description: "Triage, investigate, fix, and verify a bug",
    steps: [
      { agent: "triager", role: "triage" },
      { agent: "investigator", role: "investigate" },
      { agent: "developer", role: "fix", loop: true, verifyEach: true },
      { agent: "reviewer", role: "review" },
      { agent: "compound", role: "compound" },
    ],
  },
  "security-audit": {
    name: "security-audit",
    description: "Scan, prioritize, fix, and verify security issues",
    steps: [
      { agent: "scanner", role: "scan" },
      { agent: "triager", role: "triage" },
      { agent: "fixer", role: "fix", loop: true, verifyEach: true },
      { agent: "tester", role: "test" },
      { agent: "reviewer", role: "review" },
      { agent: "compound", role: "compound" },
    ],
  },
};
