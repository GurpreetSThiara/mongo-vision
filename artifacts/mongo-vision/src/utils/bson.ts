/**
 * BSON / MongoDB type helpers.
 * Maps BSON type names → Tailwind colour classes for consistent UI theming.
 */
import { BSON_TYPE_TEXT_COLOR, BSON_TYPE_BG_COLOR } from "@/constants";

/**
 * Get the Tailwind text colour class for a BSON type name (lowercase).
 * Falls back to "text-foreground" for unknown types.
 */
export function getBsonTypeTextColor(type: string): string {
  return BSON_TYPE_TEXT_COLOR[type] ?? "text-foreground";
}

/**
 * Get the Tailwind background colour class for a BSON type name.
 * Input must be title-cased (e.g. "String", "Number").
 * Falls back to "bg-primary" for unknown types.
 */
export function getBsonTypeBgColor(type: string): string {
  return BSON_TYPE_BG_COLOR[type] ?? "bg-primary";
}

/**
 * Normalise a raw sample value to a display type name.
 * Used when computing type distributions from sample arrays.
 */
export function normaliseSampleType(value: unknown): string {
  if (value === null) return "Null";
  if (typeof value === "boolean") return "Boolean";
  if (typeof value === "number") return "Number";
  if (Array.isArray(value)) return "Array";
  if (value instanceof Date) return "Date";
  if (typeof value === "object") {
    if ((value as Record<string, unknown>).$oid) return "Objectid";
    if ((value as Record<string, unknown>).$date) return "Date";
    return "Object";
  }
  if (typeof value === "string") {
    // Heuristic: ISO-8601 datetime strings → Date
    if (/^\d{4}-\d{2}-\d{2}T/.test(value as string) && !isNaN(Date.parse(value as string))) {
      return "Date";
    }
    return "String";
  }
  return "String";
}

/**
 * Compute a frequency map of BSON type names from an array of sample values.
 * Returns `{ typeName: count }` pairs.
 */
export function computeTypeDistribution(samples: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sample of samples) {
    const t = normaliseSampleType(sample);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}
