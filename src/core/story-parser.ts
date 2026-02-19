/**
 * Story parser — extracts story arrays from planner agent output.
 *
 * Handles common LLM output quirks: markdown code fences, trailing commas,
 * partial JSON, and various key naming conventions.
 */

import type { Story } from "./types.js";

/**
 * Parse planner output into a list of stories.
 */
export function parseStories(output: string, maxRetries: number = 3): Story[] {
  // Strip markdown code fences if present
  const stripped = output.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

  // Find the outermost JSON array using bracket balancing
  const json = extractJsonArray(stripped);
  if (!json) {
    // Fallback: try greedy regex
    const greedyMatch = stripped.match(/\[[\s\S]*\]/);
    if (!greedyMatch) {
      throw new Error(
        "Planner did not output a valid JSON story array. " +
        `Output starts with: "${output.slice(0, 200)}..."`
      );
    }
    return parseRawStories(greedyMatch[0], maxRetries);
  }

  return parseRawStories(json, maxRetries);
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") depth--;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseRawStories(jsonStr: string, maxRetries: number): Story[] {
  let raw: Array<Record<string, unknown>>;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    // Try fixing common LLM JSON issues: trailing commas
    const cleaned = jsonStr
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try {
      raw = JSON.parse(cleaned);
    } catch {
      throw new Error(
        `Failed to parse stories JSON. First 300 chars: "${jsonStr.slice(0, 300)}"`
      );
    }
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Planner output parsed but is not a non-empty array");
  }

  return raw.map((s) => ({
    id: String(s.id || s.story_id || `story-${Math.random().toString(36).slice(2, 6)}`),
    title: String(s.title || s.name || "Untitled story"),
    description: String(s.description || ""),
    acceptanceCriteria: Array.isArray(s.acceptance_criteria)
      ? s.acceptance_criteria.map(String)
      : Array.isArray(s.acceptanceCriteria)
        ? (s.acceptanceCriteria as string[]).map(String)
        : Array.isArray(s.criteria)
          ? (s.criteria as string[]).map(String)
          : [],
    status: "pending" as const,
    retryCount: 0,
    maxRetries,
  }));
}
