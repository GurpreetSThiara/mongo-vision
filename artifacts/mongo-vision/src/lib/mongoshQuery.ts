import JSON5 from "json5";

/**
 * Parse a mongosh-style query document (CLI) into a plain object suitable for
 * JSON.stringify → API query params (Extended JSON for BSON types).
 *
 * Supports:
 * - Unquoted keys, trailing commas (via JSON5)
 * - ObjectId("hex"), ObjectId('hex')
 * - ISODate("..."), new Date("...")
 * - NumberLong / NumberInt / NumberDecimal
 * - UUID("...")
 * - Optional: full line `db.coll.find({ ... })` — the first {...} argument is used
 */

export function extractFindFilterDocument(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/\.find\s*\(\s*/);
  if (!m || m.index === undefined) return trimmed;

  const afterFind = trimmed.slice(m.index + m[0].length);
  const doc = extractBalancedObject(afterFind);
  return doc ?? trimmed;
}

function extractBalancedObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  return null;
}

function preprocessMongoshConstructors(s: string): string {
  let out = s;

  out = out.replace(
    /ObjectId\s*\(\s*["']([a-fA-F0-9]{24})["']\s*\)/g,
    '{"$oid":"$1"}',
  );

  out = out.replace(/ISODate\s*\(\s*["']([^"']+)["']\s*\)/g, (_, d: string) => {
    const iso = normalizeToIso(d);
    return `{"$date":"${iso}"}`;
  });
  out = out.replace(/new\s+Date\s*\(\s*["']([^"']+)["']\s*\)/g, (_, d: string) => {
    const iso = normalizeToIso(d);
    return `{"$date":"${iso}"}`;
  });

  out = out.replace(/NumberLong\s*\(\s*["']?(\d+)["']?\s*\)/g, '{"$numberLong":"$1"}');
  out = out.replace(/NumberInt\s*\(\s*["']?(\d+)["']?\s*\)/g, '{"$numberInt":"$1"}');
  out = out.replace(
    /NumberDecimal\s*\(\s*["']([^"']+)["']\s*\)/g,
    '{"$numberDecimal":"$1"}',
  );

  out = out.replace(
    /UUID\s*\(\s*["']([a-fA-F0-9-]{36})["']\s*\)/g,
    '{"$uuid":"$1"}',
  );

  return out;
}

function normalizeToIso(d: string): string {
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toISOString();
}

export function mongoshDocumentToObject(input: string): Record<string, unknown> {
  const doc = extractFindFilterDocument(input);
  if (!doc.trim()) return {};

  const preprocessed = preprocessMongoshConstructors(doc);
  const parsed: unknown = JSON5.parse(preprocessed);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Query must be a single document object { … }, not an array or primitive.");
  }

  return parsed as Record<string, unknown>;
}
