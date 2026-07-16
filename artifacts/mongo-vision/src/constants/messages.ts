// ─── Toast titles ─────────────────────────────────────────────────────────────
export const TOAST = {
  // Connection
  CONNECTION_DELETED: "Connection deleted",
  CONNECTION_DELETE_FAILED: "Failed to delete",
  CONNECTION_TEST_SUCCESS: "Connection successful",
  CONNECTION_TEST_FAILED: "Connection failed",
  CONNECTION_CONNECTED: "Connected!",
  CONNECTION_FAILED: "Connection failed",
  // Documents
  DOCUMENT_INSERTED: "Document inserted",
  DOCUMENT_INSERT_FAILED: "Insert failed",
  DOCUMENT_UPDATED: "Document updated",
  DOCUMENT_UPDATE_FAILED: "Update failed",
  DOCUMENT_DELETED: "Document deleted",
  DOCUMENT_DELETE_FAILED: "Delete failed",
  DOCUMENT_DUPLICATED: "Document duplicated",
  DOCUMENT_DUPLICATE_FAILED: "Duplicate failed",
  DOCUMENT_COPIED: "Copied to clipboard",
  DOCUMENT_INVALID: "Invalid document",
  // Bulk
  BULK_DELETED: (count: number) => `${count} documents deleted`,
  BULK_DELETE_FAILED: "Bulk delete failed",
  BULK_UPDATED: (count: number) => `${count} documents updated`,
  BULK_UPDATE_FAILED: "Bulk update failed",
  // Queries
  QUERY_SAVED: "Query saved",
  QUERY_SAVE_FAILED: "Save failed",
  QUERY_FAILED: "Query failed",
  QUERY_FILTER_APPLIED: "Quick Filter Applied",
  AGGREGATE_FAILED: "Aggregation failed",
  EXPLAIN_FAILED: "Explain failed",
  // Indexes
  INDEX_CREATED: "Index created",
  INDEX_CREATE_FAILED: "Failed to create index",
  INDEX_DROPPED: "Index dropped",
  INDEX_DROP_FAILED: "Failed to drop index",
  // Import / Export
  IMPORT_FAILED: "Import failed",
  IMPORT_SUCCESS: (count: number) => `Imported ${count} documents`,
  EXPORT_FAILED: "Export failed",
  EXPORT_SUCCESS: "Export completed",
  EXPORT_NOTHING: "Nothing to export",
  CLIPBOARD_COPIED: "Command copied to clipboard",
  IDS_COPIED: "Copied _id list",
  EXPORTED_JSON: "Exported JSON",
  NO_DOCUMENTS: "No documents",
  NO_SELECTED: "No documents selected",
  // Schema / Validation
  VALIDATION_UPDATED: "Validation Updated",
  VALIDATION_UPDATE_FAILED: "Update Failed",
  // Collections / Databases
  COLLECTION_CREATED: "Collection created",
  COLLECTION_CREATE_FAILED: "Failed to create collection",
  COLLECTION_DROPPED: (name: string) => `Collection ${name} dropped`,
  COLLECTION_DROP_FAILED: "Failed to drop collection",
  DATABASE_DROPPED: (name: string) => `Database ${name} dropped`,
  DATABASE_DROP_FAILED: "Failed to drop database",
  // Filter
  FILTERS_RESET: "Filters Reset",
  SELECTION_INVERTED: "Selection inverted",
  FIELD_UPDATED: "Field updated",
  FIELD_UPDATE_FAILED: "Update failed",
  // Index suggestions
  INDEX_SUGGESTIONS: (count: number) => `${count} index suggestions`,
  INDEX_SUGGESTION_FAILED: "Suggestion failed",
} as const;

// ─── Toast descriptions ───────────────────────────────────────────────────────
export const TOAST_DESC = {
  FILTERS_RESET: "All filters, sorts, and views have been cleared.",
  SELECTION_INVERTED: "Bulk actions apply to the new selection",
  DOCUMENT_ROOT_MUST_BE_OBJECT: "Root must be a JSON object.",
  VALIDATION_UPDATED: "Collection constraints updated successfully.",
  EXPORT_SUCCESS: (count: number) => `Successfully exported ${count} documents.`,
  IDS_COPIED: (count: number, single?: boolean) =>
    `${count} id(s), one per line`,
  NO_SELECTED: "Select documents to export, or choose all matching.",
  CONNECTION_LATENCY: (ms: number) => `Latency: ${ms}ms`,
  NAME_URI_REQUIRED: "Name and URI are required",
  CONNECTED_TO: (host: string) => `Connected to ${host}`,
  EXPORT_PAGE_JSON: (count: number) => `${count} document(s)`,
  QUICK_FILTER_APPLIED: (field: string, value: string) =>
    `Added "${field}": ${value.slice(0, 20)} to query.`,
} as const;

// ─── UI Labels / Placeholders ─────────────────────────────────────────────────
export const LABEL = {
  // Sidebar
  SAVED_QUERIES: "Saved Queries",
  DATABASES: "Databases",
  CREATE_COLLECTION: "Create Collection",
  // Header
  SELECT_COLLECTION: "select a collection",
  SELECT_DB_AND_COLLECTION: "Select a database and collection",
  SELECT_CONNECTION: "Select a connection from the sidebar",
  SELECT_CONNECTION_START: "Select a connection to start",
  NAVIGATE_SIDEBAR: "Navigate the sidebar to connect",
  // Tabs
  TAB_DASHBOARD: "Dashboard",
  TAB_DOCUMENTS: "Documents",
  TAB_SCHEMA: "Schema",
  TAB_AGGREGATIONS: "Aggregations",
  TAB_INDEXES: "Indexes",
  TAB_PERFORMANCE: "Performance",
  TAB_CHARTS: "Charts",
  // Documents toolbar
  VIEW_JSON: "JSON view",
  VIEW_CARD: "Card view",
  VIEW_SPREADSHEET: "Spreadsheet",
  COLUMNS: "Columns",
  COMPARE: "Compare",
  SHOW_ALL: "Show All",
  SHOW_HIDE_COLUMNS: "Show/Hide Columns",
  EXPORT: "Export",
  COPY_IDS: "Copy IDs",
  INVERT_SEL: "Invert sel.",
  RESET_ALL: "Reset All",
  COLLAPSE: "Collapse",
  EXPAND: "Expand",
  COMPACT: "Compact",
  SEARCH_PLACEHOLDER: "Search… ⌘K",
  // Query modes
  QUERY_VISUAL: "Visual",
  QUERY_CODE: "Code",
  QUERY_LIVE: "Live",
  QUERY_APPLY_MODE: "Apply mode",
  APPLY_QUERY: "Apply query",
  // Modals
  CANCEL: "Cancel",
  SAVE: "Save",
  CREATE: "Create",
  INSERT: "Insert",
  DELETE: "Delete",
  DUPLICATE: "Duplicate",
  DROP_DATABASE: "Drop Database",
  DROP_COLLECTION: "Drop Collection",
  IMPORT: "Import",
  EXPORT_DATA: "Export Data",
  // Home page
  CONNECTIONS: "Connections",
  MANAGE_CONNECTIONS: "Manage your MongoDB database connections.",
  NO_CONNECTIONS_YET: "No connections yet",
  NO_CONNECTIONS_DESC:
    "Add your first MongoDB connection string to start exploring your databases, collections, and documents.",
  ADD_CONNECTION: "Add Connection",
  NEW_CONNECTION: "New Connection",
  NEW_CONNECTION_DESC: "Connect to any MongoDB instance using a URI string.",
  BACK_TO_CONNECTIONS: "Back to connections",
  // Connect page
  CONNECTION_NAME: "Connection Name",
  MONGODB_URI: "MongoDB URI",
  URI_SUPPORTS: "Supports: mongodb://, mongodb+srv://, with or without credentials",
  QUICK_CONNECT: "Quick connect examples",
  TEST: "Test",
  CONNECT: "Connect",
  CONN_NAME_PLACEHOLDER: "My Database",
  CONN_URI_PLACEHOLDER: "mongodb://localhost:27017",
  // Schema
  MANAGE_VALIDATION: "Manage Validation",
  SCHEMA_INCONSISTENCIES: "Schema Inconsistencies",
  CLICK_SCHEMA_ANALYZE: "Click Schema tab to analyze",
  // Indexes
  INDEXES: "Indexes",
  CREATE_INDEX: "Create Index",
  NO_INDEXES_FOUND: "No indexes found",
  // Charts
  SET_FIELDS_LOAD: "Set X and Y fields, then click Load Data",
  LOAD_DATA: "Load Data",
  // Performance
  QUERY_EXPLAIN: "Query Explain & Index Suggestions",
  EXPLAIN_QUERY: "Explain Query",
  SUGGEST_INDEXES: "Suggest Indexes",
  FILTER_FROM_QUERY: "Filter (from Query tab)",
  // Mobile
  MOBILE_SCHEMA_DESKTOP_ONLY: "Canvas editor is only available on desktop",
  MOBILE_SCHEMA_OPEN_DESKTOP: "Open on Desktop for full schema editing",
  OPEN_NAVIGATION: "Open navigation",
  CLOSE: "Close",
  ACTIONS: "Actions",
  BROWSE: "Browse",
  QUERY: "Query",
  SCHEMA: "Schema",
  SETTINGS: "Settings",
} as const;

// ─── Modal titles ─────────────────────────────────────────────────────────────
export const MODAL_TITLE = {
  INSERT_DOCUMENT: "Insert Document",
  EDIT_DOCUMENT: "Edit Document",
  BULK_UPDATE_DOCUMENTS: "Bulk Update Documents",
  DELETE_DOCUMENT: "Delete Document",
  DUPLICATE_DOCUMENT: "Duplicate Document",
  CREATE_INDEX: "Create Index",
  SAVE_QUERY: "Save Query",
  IMPORT_DATA: "Import Data",
  EXPORT_COLLECTION: "Export Collection Data",
  CREATE_COLLECTION: "Create Collection",
  DROP_DATABASE: "Drop Database",
  DROP_COLLECTION: "Drop Collection",
} as const;

// ─── Confirm messages ─────────────────────────────────────────────────────────
export const CONFIRM_MSG = {
  DELETE_DOCUMENT: "Are you sure you want to delete this document? This action cannot be undone.",
  DUPLICATE_DOCUMENT:
    "Are you sure you want to duplicate this document? This will create a new copy with a new unique _id.",
  DROP_DATABASE: (name: string) =>
    `Are you sure you want to drop the database ${name}?`,
  DROP_DATABASE_WARNING:
    "This action is permanent and will delete all collections and data in this database.",
  DROP_COLLECTION: (col: string, db: string) =>
    `Are you sure you want to drop the collection ${col} from ${db}?`,
  DROP_COLLECTION_WARNING:
    "This action is permanent and will delete all documents and indexes in this collection.",
  BULK_UPDATE_INFO: (count: number) =>
    `Applying update to ${count} selected documents.`,
  BULK_UPDATE_WARNING:
    "⚠️ Use standard MongoDB update operators (e.g. $set, $unset).",
} as const;
