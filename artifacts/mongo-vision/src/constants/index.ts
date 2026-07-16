// ─── Breakpoints ────────────────────────────────────────────────────────────
export const BREAKPOINT_MOBILE = 768;
export const BREAKPOINT_TABLET = 1024;

// ─── Pagination ──────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500] as const;

// ─── Import / Export ─────────────────────────────────────────────────────────
/** 20 MB hard limit before we fallback to CLI instructions */
export const IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 150 KB limit before we hide the Monaco preview editor */
export const IMPORT_PREVIEW_MAX_BYTES = 150_000;
export const EXPORT_MAX_LIMIT = 10_000;

// ─── Auto-refresh presets (seconds, 0 = off) ─────────────────────────────────
export const AUTO_REFRESH_PRESETS = [
  { label: "Off", value: 0 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
] as const;

// ─── Chart colours ───────────────────────────────────────────────────────────
export const CHART_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
] as const;

// ─── BSON type → text colour class ───────────────────────────────────────────
export const BSON_TYPE_TEXT_COLOR: Record<string, string> = {
  string: "text-emerald-400",
  number: "text-amber-400",
  double: "text-amber-400",
  int: "text-amber-400",
  long: "text-amber-400",
  decimal: "text-amber-400",
  boolean: "text-violet-400",
  object: "text-blue-400",
  array: "text-orange-400",
  null: "text-rose-400",
  objectId: "text-cyan-400",
  date: "text-pink-400",
};

// ─── BSON type → bg colour class (for distribution bars) ─────────────────────
export const BSON_TYPE_BG_COLOR: Record<string, string> = {
  String: "bg-emerald-500",
  Number: "bg-amber-500",
  Boolean: "bg-violet-500",
  Object: "bg-blue-500",
  Array: "bg-orange-500",
  Objectid: "bg-cyan-500",
  Date: "bg-pink-500",
  Null: "bg-rose-500",
};

// ─── Connection quick-connect examples ───────────────────────────────────────
export const QUICK_CONNECT_EXAMPLES = [
  { label: "Local", uri: "mongodb://localhost:27017" },
  { label: "Atlas", uri: "mongodb+srv://<user>:<pass>@cluster.mongodb.net" },
  { label: "With Auth", uri: "mongodb://admin:password@localhost:27017" },
] as const;

// ─── App name ────────────────────────────────────────────────────────────────
export const APP_NAME = "MongoVision" as const;

// ─── Mobile bottom nav height (px) ───────────────────────────────────────────
export const MOBILE_NAV_HEIGHT = 56;
