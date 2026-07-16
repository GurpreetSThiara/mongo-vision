/**
 * Application-wide runtime configuration.
 * Env-specific values read from Vite's `import.meta.env` at build time.
 * Defaults are safe for local development.
 */

export const config = {
  /** API base URL — proxied via Vite during development. */
  apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api",

  /** Default number of documents to show per page. */
  defaultPageSize: 20,

  /** Maximum number of documents to export per request. */
  exportMaxLimit: 10_000,

  /** MongoDB import file size hard limit (20 MB). */
  importMaxFileBytes: 20 * 1024 * 1024,

  /** Monaco preview hidden when file exceeds this size (150 KB). */
  importPreviewMaxBytes: 150_000,

  /** Application display name. */
  appName: "MongoVision",
} as const;

export type AppConfig = typeof config;
