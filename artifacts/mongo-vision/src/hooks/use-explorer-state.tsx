/**
 * useExplorerState
 *
 * Owns all UI state for the Explorer page.
 * Extracted from explorer.tsx to keep the page component lean.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { DEFAULT_PAGE_SIZE } from "@/constants";
import {
  loadDocExplorerPrefs,
  saveDocExplorerPrefs,
  loadSpreadsheetPrefs,
  saveSpreadsheetPrefs,
  spreadsheetStorageKey,
  type SpreadsheetLayoutPrefs,
} from "@/lib/docExplorerPrefs";

export function useExplorerState(connectionId: string, database: string, collection: string) {
  // ── Navigation / sidebar ────────────────────────────────────────────────────
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(
    () => new Set([database].filter(Boolean))
  );

  // ── Active tab ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("documents");

  // ── Pagination ──────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  // ── Filter / Sort strings ───────────────────────────────────────────────────
  const [filterStr, setFilterStr] = useState("{}");
  const [sortStr, setSortStr] = useState("{}");
  const [appliedFilterStr, setAppliedFilterStr] = useState("{}");
  const [appliedSortStr, setAppliedSortStr] = useState("{}");

  // ── Document modals ─────────────────────────────────────────────────────────
  const [fullDocumentJsonModal, setFullDocumentJsonModal] = useState<{
    docId: string;
    draft: string;
    initialJson: string;
  } | null>(null);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertJson, setInsertJson] = useState("{\n  \n}");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDocId, setEditDocId] = useState("");
  const [editJson, setEditJson] = useState("{}");
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdateJson, setBulkUpdateJson] = useState(`{\n  "$set": {\n    \n  }\n}`);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [docToDuplicate, setDocToDuplicate] = useState<Record<string, unknown> | null>(null);

  // ── Document selection / pinning ────────────────────────────────────────────
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [pinnedDocs, setPinnedDocs] = useState<Set<string>>(new Set());

  // ── Query tab ───────────────────────────────────────────────────────────────
  const [queryFilter, setQueryFilter] = useState("{}");
  const [querySort, setQuerySort] = useState("{}");
  const [queryLimit, setQueryLimit] = useState("20");
  const [queryResults, setQueryResults] = useState<Record<string, unknown>[] | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [aggregatePipeline, setAggregatePipeline] = useState('[  { "$match": {} }]');
  const [showHistory, setShowHistory] = useState(false);
  const [queryMode, setQueryMode] = useState<"visual" | "code">("visual");
  const [explainResult, setExplainResult] = useState<Record<string, unknown> | null>(null);
  const [showSaveQueryModal, setShowSaveQueryModal] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");

  // ── Doc query prefs (persisted) ─────────────────────────────────────────────
  const [docQueryMode, setDocQueryMode] = useState<"visual" | "code">(
    () => loadDocExplorerPrefs().docQueryMode
  );
  const [docCodeFormat, setDocCodeFormat] = useState<"json" | "mongosh">(
    () => loadDocExplorerPrefs().docCodeFormat
  );
  const [docQueryLive, setDocQueryLive] = useState(() => loadDocExplorerPrefs().docQueryLive);
  const [docCodeEditorsExpanded, setDocCodeEditorsExpanded] = useState(
    () => loadDocExplorerPrefs().docCodeEditorsExpanded
  );
  const [docQueryVisible, setDocQueryVisible] = useState(
    () => loadDocExplorerPrefs().docQueryVisible
  );

  useEffect(() => {
    saveDocExplorerPrefs({
      docQueryMode,
      docCodeFormat,
      docQueryLive,
      docCodeEditorsExpanded,
      docQueryVisible,
    });
  }, [docQueryMode, docCodeFormat, docQueryLive, docCodeEditorsExpanded, docQueryVisible]);

  // ── View mode ───────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"spreadsheet" | "json" | "card">("spreadsheet");

  // ── Spreadsheet prefs (persisted per collection) ────────────────────────────
  const [spreadsheetLayout, setSpreadsheetLayout] = useState<SpreadsheetLayoutPrefs>(() =>
    loadSpreadsheetPrefs("")
  );
  const spSheetKey = useMemo(
    () =>
      connectionId && database && collection
        ? spreadsheetStorageKey(connectionId, database, collection)
        : "",
    [connectionId, database, collection]
  );
  const lastSavedLayoutKey = useRef("");
  useEffect(() => {
    if (!spSheetKey) return;
    const loaded = loadSpreadsheetPrefs(spSheetKey);
    setSpreadsheetLayout(loaded);
    lastSavedLayoutKey.current = JSON.stringify(loaded);
  }, [spSheetKey]);

  const spreadsheetSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!spSheetKey) return;
    const layoutStr = JSON.stringify(spreadsheetLayout);
    if (layoutStr !== lastSavedLayoutKey.current) {
      if (spreadsheetSaveTimer.current) clearTimeout(spreadsheetSaveTimer.current);
      spreadsheetSaveTimer.current = setTimeout(() => {
        saveSpreadsheetPrefs(spSheetKey, spreadsheetLayout);
        lastSavedLayoutKey.current = layoutStr;
      }, 400);
    }
    return () => {
      if (spreadsheetSaveTimer.current) clearTimeout(spreadsheetSaveTimer.current);
    };
  }, [spreadsheetLayout, spSheetKey]);

  // ── Column management ───────────────────────────────────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [customColOrders, setCustomColOrders] = useState<Record<string, string[]>>({});
  const [showColumnManager, setShowColumnManager] = useState(false);

  // ── Local search ────────────────────────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState("");

  // ── Auto-refresh ────────────────────────────────────────────────────────────
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);

  // ── Compare mode ────────────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareDocs, setCompareDocs] = useState<string[]>([]);

  // ── Inline cell editing ─────────────────────────────────────────────────────
  const [inlineEditCell, setInlineEditCell] = useState<{
    docId: string;
    field: string;
    value: string;
  } | null>(null);

  // ── Scroll-to-top ───────────────────────────────────────────────────────────
  const documentsContentRef = useRef<HTMLDivElement>(null);
  const [docScrollShowTop, setDocScrollShowTop] = useState(false);
  const handleDocContentScroll = useCallback(() => {
    const el = documentsContentRef.current;
    if (el) setDocScrollShowTop(el.scrollTop > 320);
  }, []);
  const scrollDocumentsToTop = useCallback(() => {
    documentsContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Indexes ─────────────────────────────────────────────────────────────────
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [indexBuildMode, setIndexBuildMode] = useState<"visual" | "json">("visual");
  const [indexKeysBuilder, setIndexKeysBuilder] = useState<
    { field: string; type: "1" | "-1" | "2dsphere" | "text" }[]
  >([{ field: "", type: "1" }]);
  const [newIndexKeys, setNewIndexKeys] = useState("");
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexUnique, setNewIndexUnique] = useState(false);
  const [newIndexSparse, setNewIndexSparse] = useState(false);
  const [newIndexTTL, setNewIndexTTL] = useState(false);
  const [newIndexTTLExpires, setNewIndexTTLExpires] = useState("3600");
  const [newIndexAdvancedJSON, setNewIndexAdvancedJSON] = useState("");
  const [showAdvancedIndex, setShowAdvancedIndex] = useState(false);

  // ── Charts ──────────────────────────────────────────────────────────────────
  const [chartXField, setChartXField] = useState("");
  const [chartYField, setChartYField] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [chartData, setChartData] = useState<Record<string, unknown>[] | null>(null);

  // ── Import / Export ─────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState("");
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importFileName, setImportFileName] = useState("");
  const [importFileSize, setImportFileSize] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importFileTooLarge, setImportFileTooLarge] = useState(false);
  const [importCliCommand, setImportCliCommand] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportRange, setExportRange] = useState<"query" | "selected">("query");
  const [exportLimit, setExportLimit] = useState(1000);

  // ── Collection / Database modals ────────────────────────────────────────────
  const [showCreateColModal, setShowCreateColModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [showDropDbModal, setShowDropDbModal] = useState(false);
  const [dbToDrop, setDbToDrop] = useState("");
  const [showDropColModal, setShowDropColModal] = useState(false);
  const [colToDrop, setColToDrop] = useState("");
  const [colToDropDb, setColToDropDb] = useState("");

  // ── Validation ──────────────────────────────────────────────────────────────
  const [validationData, setValidationData] = useState<any>(null);
  const [isEditingValidation, setIsEditingValidation] = useState(false);
  const [validationJson, setValidationJson] = useState("{}");
  const [loadingValidation, setLoadingValidation] = useState(false);

  // ── Mobile sidebar drawer ────────────────────────────────────────────────────
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // ── Reset on collection change ──────────────────────────────────────────────
  useEffect(() => {
    setFilterStr("{}");
    setSortStr("{}");
    setAppliedFilterStr("{}");
    setAppliedSortStr("{}");
    setPage(1);
  }, [connectionId, database, collection]);

  return {
    // navigation
    expandedDbs, setExpandedDbs,
    // tab
    activeTab, setActiveTab,
    // pagination
    page, setPage, limit, setLimit,
    // filter / sort
    filterStr, setFilterStr,
    sortStr, setSortStr,
    appliedFilterStr, setAppliedFilterStr,
    appliedSortStr, setAppliedSortStr,
    // doc modals
    fullDocumentJsonModal, setFullDocumentJsonModal,
    showInsertModal, setShowInsertModal,
    insertJson, setInsertJson,
    showEditModal, setShowEditModal,
    editDocId, setEditDocId,
    editJson, setEditJson,
    showBulkUpdateModal, setShowBulkUpdateModal,
    bulkUpdateJson, setBulkUpdateJson,
    showBulkDeleteConfirm, setShowBulkDeleteConfirm,
    docToDelete, setDocToDelete,
    showSingleDeleteConfirm, setShowSingleDeleteConfirm,
    showDuplicateConfirm, setShowDuplicateConfirm,
    docToDuplicate, setDocToDuplicate,
    // selection / pinning
    selectedDocs, setSelectedDocs,
    pinnedDocs, setPinnedDocs,
    // query tab
    queryFilter, setQueryFilter,
    querySort, setQuerySort,
    queryLimit, setQueryLimit,
    queryResults, setQueryResults,
    queryTime, setQueryTime,
    aggregatePipeline, setAggregatePipeline,
    showHistory, setShowHistory,
    queryMode, setQueryMode,
    explainResult, setExplainResult,
    showSaveQueryModal, setShowSaveQueryModal,
    saveQueryName, setSaveQueryName,
    // doc query prefs
    docQueryMode, setDocQueryMode,
    docCodeFormat, setDocCodeFormat,
    docQueryLive, setDocQueryLive,
    docCodeEditorsExpanded, setDocCodeEditorsExpanded,
    docQueryVisible, setDocQueryVisible,
    // view mode
    viewMode, setViewMode,
    // spreadsheet
    spreadsheetLayout, setSpreadsheetLayout,
    // columns
    hiddenColumns, setHiddenColumns,
    customColOrders, setCustomColOrders,
    showColumnManager, setShowColumnManager,
    // local search
    localSearch, setLocalSearch,
    // auto-refresh
    autoRefreshInterval, setAutoRefreshInterval,
    // compare
    compareMode, setCompareMode,
    compareDocs, setCompareDocs,
    // inline edit
    inlineEditCell, setInlineEditCell,
    // scroll-to-top
    documentsContentRef,
    docScrollShowTop,
    handleDocContentScroll,
    scrollDocumentsToTop,
    // indexes
    showIndexModal, setShowIndexModal,
    indexBuildMode, setIndexBuildMode,
    indexKeysBuilder, setIndexKeysBuilder,
    newIndexKeys, setNewIndexKeys,
    newIndexName, setNewIndexName,
    newIndexUnique, setNewIndexUnique,
    newIndexSparse, setNewIndexSparse,
    newIndexTTL, setNewIndexTTL,
    newIndexTTLExpires, setNewIndexTTLExpires,
    newIndexAdvancedJSON, setNewIndexAdvancedJSON,
    showAdvancedIndex, setShowAdvancedIndex,
    // charts
    chartXField, setChartXField,
    chartYField, setChartYField,
    chartType, setChartType,
    chartData, setChartData,
    // import / export
    showImportModal, setShowImportModal,
    importData, setImportData,
    importFormat, setImportFormat,
    importFileName, setImportFileName,
    importFileSize, setImportFileSize,
    isDragOver, setIsDragOver,
    importFileTooLarge, setImportFileTooLarge,
    importCliCommand, setImportCliCommand,
    showExportModal, setShowExportModal,
    exportFormat, setExportFormat,
    exportRange, setExportRange,
    exportLimit, setExportLimit,
    // collection / db modals
    showCreateColModal, setShowCreateColModal,
    newColName, setNewColName,
    showDropDbModal, setShowDropDbModal,
    dbToDrop, setDbToDrop,
    showDropColModal, setShowDropColModal,
    colToDrop, setColToDrop,
    colToDropDb, setColToDropDb,
    // validation
    validationData, setValidationData,
    isEditingValidation, setIsEditingValidation,
    validationJson, setValidationJson,
    loadingValidation, setLoadingValidation,
    // mobile drawer
    mobileDrawerOpen, setMobileDrawerOpen,
  };
}

export type ExplorerState = ReturnType<typeof useExplorerState>;
