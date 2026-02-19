import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { parseYaml, stringifyYaml } from "../core/yaml.js";

describe("parseYaml", () => {
  it("parses simple key-value pairs", () => {
    const result = parseYaml("name: spool\nversion: 1");
    assert.deepEqual(result, { name: "spool", version: 1 });
  });

  it("parses nested maps", () => {
    const yaml = `
adapter: claude-code
loop:
  max_retries: 3
  retry_delay: 0
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.adapter, "claude-code");
    assert.deepEqual(result.loop, { max_retries: 3, retry_delay: 0 });
  });

  it("parses sequences", () => {
    const yaml = `
context:
  - steering/structure.md
  - steering/tech.md
  - steering/product.md
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.deepEqual(result.context, [
      "steering/structure.md",
      "steering/tech.md",
      "steering/product.md",
    ]);
  });

  it("parses booleans and null", () => {
    const yaml = `
auto: true
inject: false
empty: null
tilde: ~
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.auto, true);
    assert.equal(result.inject, false);
    assert.equal(result.empty, null);
    assert.equal(result.tilde, null);
  });

  it("parses quoted strings", () => {
    const yaml = `
single: 'hello world'
double: "hello world"
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.single, "hello world");
    assert.equal(result.double, "hello world");
  });

  it("parses literal block scalar (|)", () => {
    const yaml = `prompt: |
  You are a planner.
  Break tasks into stories.
  Output JSON.
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.prompt, "You are a planner.\nBreak tasks into stories.\nOutput JSON.\n");
  });

  it("parses literal block scalar with strip (|-)", () => {
    const yaml = `prompt: |-
  Hello
  World
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.prompt, "Hello\nWorld");
  });

  it("parses flow sequences", () => {
    const yaml = `needs: [plan, implement]`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.deepEqual(result.needs, ["plan", "implement"]);
  });

  it("parses empty flow sequence", () => {
    const yaml = `items: []`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.deepEqual(result.items, []);
  });

  it("parses numbers", () => {
    const yaml = `
integer: 42
negative: -3
float: 3.14
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.integer, 42);
    assert.equal(result.negative, -3);
    assert.equal(result.float, 3.14);
  });

  it("parses sequence of maps", () => {
    const yaml = `
steps:
  - id: plan
    agent: planner
  - id: implement
    agent: developer
    verifier: verifier
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    const steps = result.steps as Record<string, unknown>[];
    assert.equal(steps.length, 2);
    assert.equal(steps[0].id, "plan");
    assert.equal(steps[0].agent, "planner");
    assert.equal(steps[1].id, "implement");
    assert.equal(steps[1].verifier, "verifier");
  });

  it("handles comments", () => {
    const yaml = `
# This is a comment
name: spool # inline comment
version: 1
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.name, "spool");
    assert.equal(result.version, 1);
  });

  it("parses empty input as null", () => {
    assert.equal(parseYaml(""), null);
    assert.equal(parseYaml("# just a comment"), null);
  });

  it("parses deeply nested maps", () => {
    const yaml = `
adapters:
  claude-code:
    command: claude
    timeout: 300
  kiro:
    command: kiro-cli
    timeout: 300
`;
    const result = parseYaml(yaml) as Record<string, Record<string, Record<string, unknown>>>;
    assert.equal(result.adapters["claude-code"].command, "claude");
    assert.equal(result.adapters["claude-code"].timeout, 300);
    assert.equal(result.adapters.kiro.command, "kiro-cli");
  });

  it("parses a complete spool.yaml", () => {
    const yaml = `
version: 1
adapter: claude-code
adapters:
  claude-code:
    command: claude
    timeout: 300
loop:
  max_retries: 3
  retry_delay: 0
learnings:
  auto: true
  inject: true
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.version, 1);
    assert.equal(result.adapter, "claude-code");
    assert.equal((result.loop as Record<string, unknown>).max_retries, 3);
    assert.equal((result.learnings as Record<string, unknown>).auto, true);
  });

  it("parses a complete agent definition", () => {
    const yaml = `
name: planner
description: Feature planner

context:
  - steering/structure.md
  - steering/tech.md

output:
  format: json
  schema: stories

prompt: |
  You are a planner.
  Break the task into stories.
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.name, "planner");
    assert.deepEqual(result.context, ["steering/structure.md", "steering/tech.md"]);
    assert.equal((result.output as Record<string, unknown>).format, "json");
    assert.equal(typeof result.prompt, "string");
    assert.ok((result.prompt as string).includes("You are a planner."));
  });

  it("parses a complete workflow formula", () => {
    const yaml = `
name: feature-dev
description: Plan, implement, test, and review

steps:
  - id: plan
    agent: planner
  - id: implement
    agent: developer
    for_each: stories
    verifier: verifier
    max_retries: 3
    needs: [plan]
  - id: test
    agent: tester
    needs: [implement]
  - id: review
    agent: reviewer
    needs: [test]
  - id: learn
    agent: compound
    always: true
    needs: [review]
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    assert.equal(result.name, "feature-dev");
    const steps = result.steps as Record<string, unknown>[];
    assert.equal(steps.length, 5);
    assert.equal(steps[1].for_each, "stories");
    assert.deepEqual(steps[1].needs, ["plan"]);
    assert.equal(steps[4].always, true);
  });
});

describe("stringifyYaml", () => {
  it("stringifies scalars", () => {
    assert.equal(stringifyYaml("hello"), "hello");
    assert.equal(stringifyYaml(42), "42");
    assert.equal(stringifyYaml(true), "true");
    assert.equal(stringifyYaml(null), "null");
  });

  it("stringifies simple maps", () => {
    const output = stringifyYaml({ name: "spool", version: 1 });
    assert.ok(output.includes("name: spool"));
    assert.ok(output.includes("version: 1"));
  });

  it("stringifies sequences", () => {
    const output = stringifyYaml({ items: ["a", "b", "c"] });
    assert.ok(output.includes("- a"));
    assert.ok(output.includes("- b"));
    assert.ok(output.includes("- c"));
  });

  it("quotes special characters", () => {
    const output = stringifyYaml("hello: world");
    assert.equal(output, '"hello: world"');
  });

  it("uses block scalar for multiline strings", () => {
    const output = stringifyYaml("line1\nline2\nline3");
    assert.ok(output.includes("|"));
    assert.ok(output.includes("line1"));
  });
});
