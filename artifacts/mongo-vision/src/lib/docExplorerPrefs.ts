const LS_PREFIX = "mongo-vision-doc-explorer";

export type DocQueryMode = "visual" | "code";
export type DocCodeFormat = "json" | "mongosh";

export interface DocExplorerPrefs {
  docQueryMode: DocQueryMode;
  docCodeFormat: DocCodeFormat;
  /** When true, list refetches as filter/sort text changes. When false, Apply runs the query. */
  docQueryLive: boolean;
  /** Taller filter/sort editors in code mode */
  docCodeEditorsExpanded: boolean;
  /** Whether the query editor/builder section is visible */
  docQueryVisible: boolean;
}

const DEFAULTS: DocExplorerPrefs = {
  docQueryMode: "visual",
  docCodeFormat: "mongosh",
  docQueryLive: false,
  docCodeEditorsExpanded: false,
  docQueryVisible: true,
};

function readJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadDocExplorerPrefs(): DocExplorerPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  const raw = localStorage.getItem(`${LS_PREFIX}.v1`);
  const parsed = readJson<Partial<DocExplorerPrefs>>(raw, {});
  return {
    docQueryMode: parsed.docQueryMode === "code" ? "code" : DEFAULTS.docQueryMode,
    docCodeFormat: parsed.docCodeFormat === "json" ? "json" : DEFAULTS.docCodeFormat,
    docQueryLive: typeof parsed.docQueryLive === "boolean" ? parsed.docQueryLive : DEFAULTS.docQueryLive,
    docCodeEditorsExpanded:
      typeof parsed.docCodeEditorsExpanded === "boolean"
        ? parsed.docCodeEditorsExpanded
        : DEFAULTS.docCodeEditorsExpanded,
    docQueryVisible:
      typeof parsed.docQueryVisible === "boolean"
        ? parsed.docQueryVisible
        : DEFAULTS.docQueryVisible,
  };
}

export function saveDocExplorerPrefs(prefs: Partial<DocExplorerPrefs>): void {
  if (typeof localStorage === "undefined") return;
  const cur = loadDocExplorerPrefs();
  const next = { ...cur, ...prefs };
  localStorage.setItem(`${LS_PREFIX}.v1`, JSON.stringify(next));
}

export function spreadsheetStorageKey(connectionId: string, database: string, collection: string): string {
  return `${LS_PREFIX}.spreadsheet.${connectionId}.${database}.${collection}`;
}

export interface SpreadsheetLayoutPrefs {
  colWidths: Record<string, number>;
  rowHeight: number;
  defaultColWidth: number;
  /** Field names pinned left (after #); order follows visible column order */
  frozenFields: string[];
}

const SPREADSHEET_DEFAULTS: SpreadsheetLayoutPrefs = {
  colWidths: {},
  rowHeight: 40,
  defaultColWidth: 200,
  frozenFields: [],
};

export function loadSpreadsheetPrefs(key: string): SpreadsheetLayoutPrefs {
  if (typeof localStorage === "undefined") return { ...SPREADSHEET_DEFAULTS, colWidths: {} };
  const parsed = readJson<Partial<SpreadsheetLayoutPrefs>>(localStorage.getItem(key), {});
  const frozenFields = Array.isArray(parsed.frozenFields)
    ? (parsed.frozenFields as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    colWidths: parsed.colWidths && typeof parsed.colWidths === "object" ? parsed.colWidths : {},
    rowHeight: typeof parsed.rowHeight === "number" ? parsed.rowHeight : SPREADSHEET_DEFAULTS.rowHeight,
    defaultColWidth:
      typeof parsed.defaultColWidth === "number" ? parsed.defaultColWidth : SPREADSHEET_DEFAULTS.defaultColWidth,
    frozenFields,
  };
}

export function saveSpreadsheetPrefs(key: string, prefs: SpreadsheetLayoutPrefs): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(prefs));
}
