/**
 * Standalone formatting helpers.
 * Pure functions — no React imports, safe for use anywhere.
 */

/**
 * Format a byte count as a human-readable string.
 * @example formatBytes(1536) → "1.5 KB"
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format a document count with locale-aware thousands separators.
 * @example formatDocCount(123456) → "123,456"
 */
export function formatDocCount(count: number | undefined | null): string {
  if (count == null) return "0";
  return count.toLocaleString();
}

/**
 * Format a byte count for JSON payload display (KB above 1024).
 * @example formatPayloadSize(2048) → "2.0 KB"
 */
export function formatPayloadSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Clamp a string to a max length and append "..." if truncated.
 */
export function truncate(str: string, maxLen = 60): string {
  return str.length > maxLen ? `${str.slice(0, maxLen - 3)}...` : str;
}

/**
 * Format a pagination range string.
 * @example formatPageRange(2, 20, 45) → "21–40 of 45"
 */
export function formatPageRange(page: number, limit: number, total: number): string {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return `${from}–${to} of ${total.toLocaleString()}`;
}
