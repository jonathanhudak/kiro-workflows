/**
 * Minimal YAML parser for spool configuration files.
 *
 * Supports the subset needed by spool:
 * - Scalars (strings, numbers, booleans, null)
 * - Maps (indentation-based nesting)
 * - Sequences (- prefix)
 * - Multi-line strings (| for literal block, > for folded block)
 * - Comments (# to end of line)
 * - Quoted strings (single and double)
 * - Flow sequences ([a, b, c])
 *
 * Does NOT support: anchors, aliases, tags, merge keys, complex keys.
 */

interface Line {
  indent: number;
  raw: string;
  content: string;
}

export function parseYaml(text: string): unknown {
  const lines = text.split("\n").map(rawLine => {
    const trimmed = rawLine.replace(/#(?=\s|$).*$/, "").trimEnd();
    // Don't strip inline comments from inside quoted strings
    const content = stripInlineComment(rawLine).trimEnd();
    const indent = rawLine.search(/\S/);
    return { indent: indent === -1 ? 0 : indent, raw: rawLine, content };
  });

  // Remove empty/comment-only lines at start and end, keep internal ones
  const filtered = lines.filter(l => l.content.trim() !== "");
  if (filtered.length === 0) return null;

  const [result] = parseNode(filtered, 0, -1);
  return result;
}

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || line[i - 1] === " ") {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseNode(lines: Line[], start: number, parentIndent: number): [unknown, number] {
  if (start >= lines.length) return [null, start];

  const line = lines[start];
  const content = line.content.trim();

  // Sequence item
  if (content.startsWith("- ") || content === "-") {
    return parseSequence(lines, start, line.indent);
  }

  // Map entry (key: value)
  if (content.includes(":")) {
    return parseMap(lines, start, line.indent);
  }

  // Bare scalar
  return [parseScalar(content), start + 1];
}

function parseMap(lines: Line[], start: number, baseIndent: number): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const content = line.content.trim();

    if (content === "" || line.indent < baseIndent) break;
    if (line.indent > baseIndent) break;

    // Must be a key: value pair
    const colonIdx = findKeyColon(content);
    if (colonIdx === -1) break;

    const key = content.slice(0, colonIdx).trim();
    const valuePart = content.slice(colonIdx + 1).trim();

    if (valuePart === "|" || valuePart === "|+" || valuePart === "|-") {
      // Literal block scalar
      const [block, nextIdx] = parseBlockScalar(lines, i + 1, line.indent, "literal", valuePart);
      result[key] = block;
      i = nextIdx;
    } else if (valuePart === ">" || valuePart === ">+" || valuePart === ">-") {
      // Folded block scalar
      const [block, nextIdx] = parseBlockScalar(lines, i + 1, line.indent, "folded", valuePart);
      result[key] = block;
      i = nextIdx;
    } else if (valuePart === "") {
      // Value is a nested structure on the next line(s)
      if (i + 1 < lines.length && lines[i + 1].indent > baseIndent) {
        const [nested, nextIdx] = parseNode(lines, i + 1, baseIndent);
        result[key] = nested;
        i = nextIdx;
      } else {
        result[key] = null;
        i++;
      }
    } else if (valuePart.startsWith("[")) {
      // Flow sequence
      result[key] = parseFlowSequence(valuePart);
      i++;
    } else if (valuePart.startsWith("{")) {
      // Flow map
      result[key] = parseFlowMap(valuePart);
      i++;
    } else {
      result[key] = parseScalar(valuePart);
      i++;
    }
  }

  return [result, i];
}

function parseSequence(lines: Line[], start: number, baseIndent: number): [unknown[], number] {
  const result: unknown[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const content = line.content.trim();

    if (content === "" || line.indent < baseIndent) break;
    if (line.indent > baseIndent && !content.startsWith("- ") && content !== "-") break;
    if (line.indent !== baseIndent) break;

    if (!content.startsWith("- ") && content !== "-") break;

    const itemContent = content === "-" ? "" : content.slice(2).trim();

    if (itemContent === "" && i + 1 < lines.length && lines[i + 1].indent > baseIndent) {
      // Nested structure under sequence item
      const [nested, nextIdx] = parseNode(lines, i + 1, baseIndent);
      result.push(nested);
      i = nextIdx;
    } else if (itemContent.includes(":") && !isQuotedString(itemContent)) {
      // Inline map start — check if there are more indented lines following
      if (i + 1 < lines.length && lines[i + 1].indent > baseIndent) {
        // Multi-line map as sequence item
        const mapLines: Line[] = [
          { indent: baseIndent + 2, raw: itemContent, content: itemContent },
        ];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > baseIndent && lines[j].content.trim() !== "") {
          mapLines.push(lines[j]);
          j++;
        }
        const [mapResult] = parseMap(mapLines, 0, baseIndent + 2);
        result.push(mapResult);
        i = j;
      } else {
        // Single-line map entry as sequence item
        const fakeLines: Line[] = [{ indent: 0, raw: itemContent, content: itemContent }];
        const [mapResult] = parseMap(fakeLines, 0, 0);
        result.push(mapResult);
        i++;
      }
    } else {
      result.push(parseScalar(itemContent));
      i++;
    }
  }

  return [result, i];
}

function parseBlockScalar(
  lines: Line[],
  start: number,
  parentIndent: number,
  style: "literal" | "folded",
  indicator: string
): [string, number] {
  if (start >= lines.length) return ["", start];

  // Determine block indent from first content line
  let blockIndent = -1;
  const blockLines: string[] = [];
  let i = start;

  // Find all lines that belong to this block (including blank lines within)
  while (i < lines.length) {
    const raw = lines[i].raw;
    const trimmed = raw.trimEnd();

    // Empty line — include in block but don't use for indent detection
    if (trimmed === "") {
      blockLines.push("");
      i++;
      continue;
    }

    const lineIndent = raw.search(/\S/);
    if (lineIndent <= parentIndent) break;

    if (blockIndent === -1) {
      blockIndent = lineIndent;
    }

    if (lineIndent < blockIndent) break;

    blockLines.push(raw.slice(blockIndent));
    i++;
  }

  // Trim trailing empty lines (unless + chomping)
  if (!indicator.endsWith("+")) {
    while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
      blockLines.pop();
    }
  }

  if (style === "literal") {
    const text = blockLines.join("\n");
    return [indicator.endsWith("-") ? text : text + "\n", i];
  }

  // Folded: join lines with spaces, preserve blank line breaks
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const bl of blockLines) {
    if (bl === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      paragraphs.push("");
    } else {
      current.push(bl);
    }
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }

  const text = paragraphs.join("\n");
  return [indicator.endsWith("-") ? text : text + "\n", i];
}

function parseFlowSequence(text: string): unknown[] {
  const inner = text.slice(1, text.lastIndexOf("]")).trim();
  if (inner === "") return [];
  return splitFlow(inner).map(item => parseScalar(item.trim()));
}

function parseFlowMap(text: string): Record<string, unknown> {
  const inner = text.slice(1, text.lastIndexOf("}")).trim();
  if (inner === "") return {};
  const result: Record<string, unknown> = {};
  for (const pair of splitFlow(inner)) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    result[key] = parseScalar(value);
  }
  return result;
}

function splitFlow(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of text) {
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === "[" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "]" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseScalar(text: string): string | number | boolean | null {
  if (text === "" || text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;

  // Quoted string
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }

  // Number
  if (/^-?\d+$/.test(text)) return parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return parseFloat(text);

  return text;
}

function findKeyColon(content: string): number {
  // Find the first unquoted colon followed by space, end of string, or newline
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      if (i + 1 >= content.length || content[i + 1] === " " || content[i + 1] === "\n") {
        return i;
      }
    }
  }
  return -1;
}

function isQuotedString(text: string): boolean {
  return (text.startsWith('"') && text.endsWith('"')) ||
         (text.startsWith("'") && text.endsWith("'"));
}

// ─── Stringify ──────────────────────────────────────────────────────────────

export function stringifyYaml(value: unknown, indent: number = 0): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return stringifyString(value, indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const prefix = " ".repeat(indent);
    return value.map(item => {
      const itemStr = stringifyYaml(item, indent + 2);
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        // Map item: put first key on same line as -
        const firstNewline = itemStr.indexOf("\n");
        if (firstNewline === -1) {
          return `${prefix}- ${itemStr.trim()}`;
        }
        return `${prefix}- ${itemStr.trim()}`;
      }
      return `${prefix}- ${itemStr}`;
    }).join("\n");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    const prefix = " ".repeat(indent);
    return keys.map(key => {
      const val = obj[key];
      if (typeof val === "object" && val !== null) {
        return `${prefix}${key}:\n${stringifyYaml(val, indent + 2)}`;
      }
      return `${prefix}${key}: ${stringifyYaml(val, indent)}`;
    }).join("\n");
  }

  return String(value);
}

function stringifyString(s: string, _indent: number): string {
  if (s.includes("\n")) {
    const lines = s.split("\n");
    return "|\n" + lines.map(l => "  " + l).join("\n");
  }
  if (/[:#\[\]{},"'|>&*!?]/.test(s) || s === "" || s === "true" || s === "false" || s === "null") {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
