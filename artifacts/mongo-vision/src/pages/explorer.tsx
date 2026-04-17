import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDatabases,
  useListCollections,
  useListDocuments,
  useInsertDocument,
  useUpdateDocument,
  useDeleteDocument,
  useBulkOperation,
  useExecuteQuery,
  useExecuteAggregate,
  useAnalyzeSchema,
  useListIndexes,
  useCreateIndex,
  useDropIndex,
  useExplainQuery,
  useSuggestIndexes,
  useExportCollection,
  useImportCollection,
  useCreateCollection,
  useDropCollection,
  useDropDatabase,
  useListSavedQueries,
  useSaveQuery,
  useDeleteSavedQuery,
  getListDatabasesQueryKey,
  getListCollectionsQueryKey,
  getListDocumentsQueryKey,
  getAnalyzeSchemaQueryKey,
  getListIndexesQueryKey,
  getListSavedQueriesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Database, ChevronRight, ChevronDown, Table, Code, BarChart3,
  Layers, Zap, ArrowLeft, Plus, Trash2, RefreshCw, Download,
  Upload, Search, Settings, BookmarkCheck, FileJson, Play,
  Filter, SortAsc, Star, ChevronLeft, ChevronRightIcon, Loader2,
  AlertCircle, CheckCircle, XCircle, Eye, Clock, MousePointerClick,
  Copy, Columns, LayoutGrid, Timer, Pin,
  LayoutList, FileText, Diff, X, Shield, ChevronsDownUp, Grid3x3,
  ArrowUpToLine, ListTree, ChevronUp,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QueryEditor } from "@/components/QueryEditor";
import { QueryTemplates } from "@/components/QueryTemplates";
import { QueryHistory, addToHistory } from "@/components/QueryHistory";
import { AggregationPipelineBuilder } from "@/components/AggregationPipelineBuilder";
import { VisualQueryBuilder } from "@/components/VisualQueryBuilder";
import { DocumentsSpreadsheetView } from "@/components/DocumentsSpreadsheetView";
import { DocumentsJsonView } from "@/components/DocumentsJsonView";
import { DocumentsCardView } from "@/components/DocumentsCardView";
import { DocumentJsonModal } from "@/components/DocumentJsonModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mongoshDocumentToObject } from "@/lib/mongoshQuery";
import {
  loadDocExplorerPrefs,
  saveDocExplorerPrefs,
  loadSpreadsheetPrefs,
  saveSpreadsheetPrefs,
  spreadsheetStorageKey,
  type SpreadsheetLayoutPrefs,
} from "@/lib/docExplorerPrefs";

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null) return <span className="text-rose-400">null</span>;
  if (data === undefined) return <span className="text-gray-500">undefined</span>;
  if (typeof data === "boolean") return <span className="text-violet-400">{String(data)}</span>;
  if (typeof data === "number") return <span className="text-amber-400">{String(data)}</span>;
  if (typeof data === "string") return <span className="text-emerald-400">"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400">[]</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white">
          {collapsed ? <ChevronRight className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />}
          <span className="text-gray-400">[{data.length}]</span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-gray-700 pl-2">
            {data.map((item, i) => (
              <div key={i} className="my-0.5">
                <span className="text-gray-500">{i}: </span>
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return <span className="text-gray-400">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white">
          {collapsed ? <ChevronRight className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />}
          <span className="text-gray-400">{"{"}…{"}"}</span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-gray-700 pl-2">
            {keys.map((k) => (
              <div key={k} className="my-0.5">
                <span className="text-blue-300">"{k}"</span>
                <span className="text-gray-400">: </span>
                <JsonTree data={(data as Record<string, unknown>)[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}


export default function Explorer() {
  const params = useParams<{ connectionId?: string; database?: string; collection?: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const connectionId = params.connectionId || "";
  const database = params.database || "";
  const collection = params.collection || "";

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set([database].filter(Boolean)));
  const [activeTab, setActiveTab] = useState("documents");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filterStr, setFilterStr] = useState("{}");
  const [sortStr, setSortStr] = useState("{}");
  const [fullDocumentJsonModal, setFullDocumentJsonModal] = useState<{
    docId: string;
    draft: string;
    initialJson: string;
  } | null>(null);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertJson, setInsertJson] = useState("{\n  \n}");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [queryFilter, setQueryFilter] = useState("{}");
  const [querySort, setQuerySort] = useState("{}");
  const [queryLimit, setQueryLimit] = useState("20");
  const [queryResults, setQueryResults] = useState<Record<string, unknown>[] | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [aggregatePipeline, setAggregatePipeline] = useState('[\n  { "$match": {} }\n]');
  const [newIndexKeys, setNewIndexKeys] = useState('');
  const [newIndexUnique, setNewIndexUnique] = useState(false);
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [explainResult, setExplainResult] = useState<Record<string, unknown> | null>(null);
  const [chartXField, setChartXField] = useState("");
  const [chartYField, setChartYField] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [chartData, setChartData] = useState<Record<string, unknown>[] | null>(null);
  const [showSaveQueryModal, setShowSaveQueryModal] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState("");
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDocId, setEditDocId] = useState("");
  const [editJson, setEditJson] = useState("{}");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState(false);
  const [showCreateColModal, setShowCreateColModal] = useState(false);
  const [validationData, setValidationData] = useState<any>(null);
  const [isEditingValidation, setIsEditingValidation] = useState(false);
  const [validationJson, setValidationJson] = useState("{}");
  const [loadingValidation, setLoadingValidation] = useState(false);

  const fetchValidation = useCallback(async () => {
    if (!database || !collection) return;
    setLoadingValidation(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/databases/${database}/collections/${collection}/validation`);
      const data = await res.json();
      setValidationData(data);
      setValidationJson(JSON.stringify(data.validator || {}, null, 2));
    } catch (err) {
      console.error("Failed to fetch validation:", err);
    } finally {
      setLoadingValidation(false);
    }
  }, [connectionId, database, collection]);

  const handleUpdateValidation = async () => {
    try {
      const validator = JSON.parse(validationJson);
      const res = await fetch(`/api/connections/${connectionId}/databases/${database}/collections/${collection}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validator,
          validationLevel: validationData?.validationLevel || "strict",
          validationAction: validationData?.validationAction || "error"
        })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Validation Updated", description: "Collection constraints updated successfully." });
        setIsEditingValidation(false);
        fetchValidation();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      toast({ title: "Update Failed", description: err instanceof Error ? err.message : "Invalid JSON", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (activeTab === "schema") fetchValidation();
  }, [activeTab, fetchValidation]);

  const handleResetAll = () => {
    setFilterStr("{}");
    setSortStr("{}");
    setAppliedFilterStr("{}");
    setAppliedSortStr("{}");
    setLocalSearch("");
    setHiddenColumns(new Set());
    setPinnedDocs(new Set());
    setPage(1);
    toast({ title: "Filters Reset", description: "All filters, sorts, and views have been cleared." });
  };

  const [newColName, setNewColName] = useState("");
  const [showDropDbModal, setShowDropDbModal] = useState(false);
  const [dbToDrop, setDbToDrop] = useState("");
  const [showDropColModal, setShowDropColModal] = useState(false);
  const [colToDrop, setColToDrop] = useState("");
  const [colToDropDb, setColToDropDb] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [queryMode, setQueryMode] = useState<"visual" | "code">("visual");
  // ── New Features State (defaults + localStorage via loadDocExplorerPrefs) ──
  const [docQueryMode, setDocQueryMode] = useState<"visual" | "code">(
    () => loadDocExplorerPrefs().docQueryMode,
  );
  const [docCodeFormat, setDocCodeFormat] = useState<"json" | "mongosh">(
    () => loadDocExplorerPrefs().docCodeFormat,
  );
  const [docQueryLive, setDocQueryLive] = useState(() => loadDocExplorerPrefs().docQueryLive);
  const [docCodeEditorsExpanded, setDocCodeEditorsExpanded] = useState(
    () => loadDocExplorerPrefs().docCodeEditorsExpanded,
  );
  const [docQueryVisible, setDocQueryVisible] = useState(
    () => loadDocExplorerPrefs().docQueryVisible,
  );
  /** When docQueryLive is false, the list uses these until Apply. */
  const [appliedFilterStr, setAppliedFilterStr] = useState("{}");
  const [appliedSortStr, setAppliedSortStr] = useState("{}");
  const [viewMode, setViewMode] = useState<"spreadsheet" | "json" | "card">("spreadsheet");
  const [spreadsheetLayout, setSpreadsheetLayout] = useState<SpreadsheetLayoutPrefs>(() =>
    loadSpreadsheetPrefs(""),
  );
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState("");
  const [pinnedDocs, setPinnedDocs] = useState<Set<string>>(new Set());
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareDocs, setCompareDocs] = useState<string[]>([]);
  const [inlineEditCell, setInlineEditCell] = useState<{ docId: string; field: string; value: string } | null>(null);
  const [showColumnManager, setShowColumnManager] = useState(false);

  const spSheetKey = useMemo(
    () =>
      connectionId && database && collection
        ? spreadsheetStorageKey(connectionId, database, collection)
        : "",
    [connectionId, database, collection],
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

  useEffect(() => {
    if (!spSheetKey) return;
    setSpreadsheetLayout(loadSpreadsheetPrefs(spSheetKey));
  }, [spSheetKey]);

  const spreadsheetSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!spSheetKey) return;
    if (spreadsheetSaveTimer.current) clearTimeout(spreadsheetSaveTimer.current);
    spreadsheetSaveTimer.current = setTimeout(() => {
      saveSpreadsheetPrefs(spSheetKey, spreadsheetLayout);
    }, 400);
    return () => {
      if (spreadsheetSaveTimer.current) clearTimeout(spreadsheetSaveTimer.current);
    };
  }, [spreadsheetLayout, spSheetKey]);

  useEffect(() => {
    setFilterStr("{}");
    setSortStr("{}");
    setAppliedFilterStr("{}");
    setAppliedSortStr("{}");
    setPage(1);
  }, [connectionId, database, collection]);

  const applyDocumentQuery = useCallback(() => {
    setAppliedFilterStr(filterStr);
    setAppliedSortStr(sortStr);
    setPage(1);
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
  }, [filterStr, sortStr, connectionId, database, collection, queryClient]);

  const parseFilter = useCallback((str: string) => {
    if (!str || str.trim() === "") return {};
    try {
      return JSON.parse(str);
    } catch (err: any) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
  }, []);

  const documentsListParams = useMemo(() => {
    const effFilterStr = docQueryLive ? filterStr : appliedFilterStr;
    const effSortStr = docQueryLive ? sortStr : appliedSortStr;
    const emptyFilter = !effFilterStr.trim() || effFilterStr.trim() === "{}";
    const emptySort = !effSortStr.trim() || effSortStr.trim() === "{}";

    if (docQueryMode !== "code" || docCodeFormat === "json") {
      return {
        page,
        limit,
        filter: emptyFilter ? undefined : effFilterStr,
        sort: emptySort ? undefined : effSortStr,
        parseError: null as string | null,
      };
    }

    try {
      return {
        page,
        limit,
        filter: emptyFilter ? undefined : JSON.stringify(mongoshDocumentToObject(effFilterStr)),
        sort: emptySort ? undefined : JSON.stringify(mongoshDocumentToObject(effSortStr)),
        parseError: null as string | null,
      };
    } catch (e) {
      return {
        page,
        limit,
        filter: undefined,
        sort: undefined,
        parseError: e instanceof Error ? e.message : String(e),
      };
    }
  }, [
    docQueryMode,
    docCodeFormat,
    docQueryLive,
    filterStr,
    appliedFilterStr,
    sortStr,
    appliedSortStr,
    page,
    limit,
  ]);

  const shellQueryBlocked = documentsListParams.parseError !== null;

  const { data: dbsData, isLoading: dbsLoading } = useListDatabases(connectionId, {
    query: { enabled: !!connectionId, queryKey: getListDatabasesQueryKey(connectionId) }
  });

  const { data: colsData, isLoading: colsLoading } = useListCollections(connectionId, database, {
    query: { enabled: !!connectionId && !!database, queryKey: getListCollectionsQueryKey(connectionId, database) }
  });

  const { data: docsData, isLoading: docsLoading, error: docsError } = useListDocuments(
    connectionId, database, collection,
    {
      page: documentsListParams.page,
      limit: documentsListParams.limit,
      filter: documentsListParams.filter,
      sort: documentsListParams.sort,
    },
    {
      query: {
        enabled: !!connectionId && !!database && !!collection && !shellQueryBlocked,
        queryKey: getListDocumentsQueryKey(connectionId, database, collection, {
          page: documentsListParams.page,
          limit: documentsListParams.limit,
          filter: documentsListParams.filter,
          sort: documentsListParams.sort,
        }),
      },
    },
  );

  const { data: schemaData, isLoading: schemaLoading, refetch: refetchSchema } = useAnalyzeSchema(connectionId, database, collection, {}, {
    query: { enabled: !!connectionId && !!database && !!collection && (activeTab === "schema" || activeTab === "query" || activeTab === "documents"), queryKey: getAnalyzeSchemaQueryKey(connectionId, database, collection, {}) }
  });

  const { data: indexData, isLoading: indexLoading } = useListIndexes(connectionId, database, collection, {
    query: { enabled: !!connectionId && !!database && !!collection && activeTab === "indexes", queryKey: getListIndexesQueryKey(connectionId, database, collection) }
  });

  const { data: savedQueriesData } = useListSavedQueries({
    query: { queryKey: getListSavedQueriesQueryKey() }
  });

  const insertDoc = useInsertDocument();
  const updateDoc = useUpdateDocument();
  const deleteDoc = useDeleteDocument();
  const bulkOp = useBulkOperation();
  const executeQuery = useExecuteQuery();
  const executeAggregate = useExecuteAggregate();
  const createIndex = useCreateIndex();
  const dropIndex = useDropIndex();
  const explainQuery = useExplainQuery();
  const suggestIndexes = useSuggestIndexes();
  const exportCol = useExportCollection();
  const saveQuery = useSaveQuery();
  const deleteSavedQuery = useDeleteSavedQuery();
  const importCol = useImportCollection();
  const createCol = useCreateCollection();
  const dropCol = useDropCollection();
  const dropDb = useDropDatabase();

  const handleInsert = async () => {
    try {
      const doc = JSON.parse(insertJson);
      await insertDoc.mutateAsync({ connectionId, dbName: database, collectionName: collection, data: { document: doc } });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setShowInsertModal(false);
      setInsertJson("{\n  \n}");
      toast({ title: "Document inserted" });
    } catch (err: any) {
      toast({ title: "Insert failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDoc.mutateAsync({ connectionId, dbName: database, collectionName: collection, documentId: docId });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      toast({ title: "Document deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedDocs);
    if (ids.length === 0) return;
    try {
      const filter = { _id: { $in: ids.map(id => ({ $oid: id })) } };
      await bulkOp.mutateAsync({ connectionId, dbName: database, collectionName: collection, data: { operation: "deleteMany", filter } });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setSelectedDocs(new Set());
      toast({ title: `${ids.length} documents deleted` });
    } catch (err: any) {
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicateDoc = async (doc: Record<string, unknown>) => {
    try {
      const { _id, ...rest } = doc;
      await insertDoc.mutateAsync({ connectionId, dbName: database, collectionName: collection, data: { document: rest } });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      toast({ title: "Document duplicated" });
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyDoc = (doc: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    toast({ title: "Copied to clipboard" });
  };

  const handleQuickFilter = useCallback((field: string, value: unknown) => {
    let filter: any = {};
    try {
      filter = JSON.parse(filterStr || "{}");
    } catch {
      filter = {};
    }
    const nextFilter = { ...filter, [field]: value };
    const nextFilterStr = JSON.stringify(nextFilter, null, 2);
    setFilterStr(nextFilterStr);
    
    if (docQueryLive) {
      setPage(1);
    } else {
      setAppliedFilterStr(nextFilterStr);
      setPage(1);
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
    }
    
    toast({ 
      title: "Quick Filter Applied", 
      description: `Added "${field}": ${String(value).slice(0, 20)} to query.` 
    });
  }, [filterStr, docQueryLive, connectionId, database, collection, queryClient, toast]);

  const handleInlineEdit = async (
    docId: string,
    field: string,
    newValue: string,
    previousValue?: string,
  ): Promise<boolean> => {
    if (previousValue !== undefined) {
      const norm = (s: string) => {
        const t = s.trim();
        if (t === "") return "";
        try {
          return JSON.stringify(JSON.parse(t));
        } catch {
          return t;
        }
      };
      if (norm(previousValue) === norm(newValue)) {
        setInlineEditCell(null);
        return true;
      }
    }
    try {
      let parsed: unknown = newValue;
      try {
        parsed = JSON.parse(newValue);
      } catch {
        parsed = newValue;
      }
      const update = { $set: { [field]: parsed } };
      await updateDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: docId,
        data: { update },
      });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setInlineEditCell(null);
      toast({ title: "Field updated" });
      return true;
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const openFullDocumentJsonModal = (doc: Record<string, unknown>) => {
    const docId = String(doc._id ?? "");
    const s = JSON.stringify(doc, null, 2);
    setFullDocumentJsonModal({ docId, draft: s, initialJson: s });
  };

  const handleFullDocumentJsonModalSave = async () => {
    if (!fullDocumentJsonModal) return;
    const norm = (txt: string) => {
      const t = txt.trim();
      if (t === "") return "";
      try {
        return JSON.stringify(JSON.parse(t));
      } catch {
        return t;
      }
    };
    if (norm(fullDocumentJsonModal.initialJson) === norm(fullDocumentJsonModal.draft)) {
      setFullDocumentJsonModal(null);
      return;
    }
    try {
      const update = JSON.parse(fullDocumentJsonModal.draft);
      if (typeof update !== "object" || update === null || Array.isArray(update)) {
        toast({
          title: "Invalid document",
          description: "Root must be a JSON object.",
          variant: "destructive",
        });
        return;
      }
      await updateDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: fullDocumentJsonModal.docId,
        data: { update: update as Record<string, unknown>, replace: true },
      });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setFullDocumentJsonModal(null);
      toast({ title: "Document updated" });
    } catch (err: unknown) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Invalid JSON",
        variant: "destructive",
      });
    }
  };

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshInterval <= 0 || !connectionId || !database || !collection) return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, connectionId, database, collection, queryClient]);

  const handleRunQuery = async () => {
    try {
      const startTime = performance.now();
      const result = await executeQuery.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: {
          filter: parseFilter(queryFilter),
          sort: parseFilter(querySort),
          limit: Number(queryLimit) || 20,
        }
      });
      const execTime = result.executionTimeMs ?? Math.round(performance.now() - startTime);
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(execTime);
      // Record in history
      addToHistory({
        query: queryFilter,
        type: "find",
        collection,
        database,
        executionTimeMs: execTime,
        resultCount: (result.documents as unknown[])?.length || 0,
      });
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRunAggregate = async () => {
    try {
      const startTime = performance.now();
      const pipeline = JSON.parse(aggregatePipeline);
      const result = await executeAggregate.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { pipeline }
      });
      const execTime = result.executionTimeMs ?? Math.round(performance.now() - startTime);
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(execTime);
      // Record in history
      addToHistory({
        query: aggregatePipeline,
        type: "aggregate",
        collection,
        database,
        executionTimeMs: execTime,
        resultCount: (result.documents as unknown[])?.length || 0,
      });
    } catch (err: any) {
      toast({ title: "Aggregation failed", description: err.message, variant: "destructive" });
    }
  };

  const handleExplain = async () => {
    try {
      const result = await explainQuery.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { filter: parseFilter(queryFilter) }
      });
      setExplainResult(result as unknown as Record<string, unknown>);
    } catch (err: any) {
      toast({ title: "Explain failed", description: err.message, variant: "destructive" });
    }
  };

  const handleExport = async (format: "json" | "csv") => {
    try {
      const result = await exportCol.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { format, filter: parseFilter(filterStr) }
      });
      const blob = new Blob([result.data], { type: format === "json" ? "application/json" : "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${result.documentCount} documents` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSaveQuery = async () => {
    try {
      await saveQuery.mutateAsync({
        data: {
          name: saveQueryName,
          connectionId,
          database,
          collection,
          query: { filter: parseFilter(queryFilter), sort: parseFilter(querySort), limit: Number(queryLimit) }
        }
      });
      queryClient.invalidateQueries({ queryKey: getListSavedQueriesQueryKey() });
      setShowSaveQueryModal(false);
      setSaveQueryName("");
      toast({ title: "Query saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateIndex = async () => {
    try {
      const keys = JSON.parse(newIndexKeys);
      await createIndex.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { keys, options: { unique: newIndexUnique } }
      });
      queryClient.invalidateQueries({ queryKey: getListIndexesQueryKey(connectionId, database, collection) });
      setShowIndexModal(false);
      toast({ title: "Index created" });
    } catch (err: any) {
      toast({ title: "Failed to create index", description: err.message, variant: "destructive" });
    }
  };

  const handleDropIndex = async (indexName: string) => {
    try {
      await dropIndex.mutateAsync({ connectionId, dbName: database, collectionName: collection, indexName });
      queryClient.invalidateQueries({ queryKey: getListIndexesQueryKey(connectionId, database, collection) });
      toast({ title: "Index dropped" });
    } catch (err: any) {
      toast({ title: "Failed to drop index", description: err.message, variant: "destructive" });
    }
  };

  const handleRunChart = async () => {
    try {
      const result = await executeQuery.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { filter: {}, limit: 100 }
      });
      setChartData(result.documents as Record<string, unknown>[]);
    } catch (err: any) {
      toast({ title: "Chart query failed", description: err.message, variant: "destructive" });
    }
  };

  const handleEditSave = async () => {
    try {
      const update = JSON.parse(editJson);
      await updateDoc.mutateAsync({ connectionId, dbName: database, collectionName: collection, documentId: editDocId, data: { update, replace: true } });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setShowEditModal(false);
      toast({ title: "Document updated" });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateCollection = async () => {
    try {
      await createCol.mutateAsync({ connectionId, dbName: database, data: { name: newColName } });
      queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey(connectionId, database) });
      setShowCreateColModal(false);
      setNewColName("");
      toast({ title: "Collection created" });
    } catch (err: any) {
      toast({ title: "Failed to create collection", description: err.message, variant: "destructive" });
    }
  };

  const handleDropDatabase = async () => {
    try {
      await dropDb.mutateAsync({ connectionId, dbName: dbToDrop });
      queryClient.invalidateQueries({ queryKey: getListDatabasesQueryKey(connectionId) });
      setShowDropDbModal(false);
      if (database === dbToDrop) setLocation(`/explorer/${connectionId}`);
      toast({ title: `Database ${dbToDrop} dropped` });
    } catch (err: any) {
      toast({ title: "Failed to drop database", description: err.message, variant: "destructive" });
    }
  };

  const handleDropCollection = async () => {
    try {
      await dropCol.mutateAsync({ connectionId, dbName: colToDropDb, collectionName: colToDrop });
      queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey(connectionId, colToDropDb) });
      setShowDropColModal(false);
      if (database === colToDropDb && collection === colToDrop) {
        setLocation(`/explorer/${connectionId}/${database}`);
      }
      toast({ title: `Collection ${colToDrop} dropped` });
    } catch (err: any) {
      toast({ title: "Failed to drop collection", description: err.message, variant: "destructive" });
    }
  };

  const docs = shellQueryBlocked
    ? []
    : ((docsData?.documents as Record<string, unknown>[]) || []);

  const sortedVisibleDocs = useMemo(() => {
    let filteredDocs = docs;
    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      filteredDocs = docs.filter((doc) =>
        Object.values(doc).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    return [...filteredDocs].sort((a, b) => {
      const aPin = pinnedDocs.has(String(a._id)) ? 0 : 1;
      const bPin = pinnedDocs.has(String(b._id)) ? 0 : 1;
      return aPin - bPin;
    });
  }, [docs, localSearch, pinnedDocs]);

  const visibleJsonPayloadBytes = useMemo(
    () => new Blob([JSON.stringify(sortedVisibleDocs)]).size,
    [sortedVisibleDocs],
  );

  const documentsContentRef = useRef<HTMLDivElement>(null);
  const [docScrollShowTop, setDocScrollShowTop] = useState(false);

  const handleDocContentScroll = useCallback(() => {
    const el = documentsContentRef.current;
    if (!el) return;
    setDocScrollShowTop(el.scrollTop > 320);
  }, []);

  const scrollDocumentsToTop = useCallback(() => {
    documentsContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-doc-page-search]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyDocIdToast = useCallback(
    (id: string) => {
      void navigator.clipboard.writeText(id);
      toast({
        title: "_id copied",
        description: id.length > 56 ? `${id.slice(0, 28)}…` : id,
      });
    },
    [toast],
  );

  const exportVisibleDocumentsJson = useCallback(() => {
    if (sortedVisibleDocs.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const blob = new Blob([JSON.stringify(sortedVisibleDocs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${database}-${collection}-page${page}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported JSON", description: `${sortedVisibleDocs.length} document(s)` });
  }, [sortedVisibleDocs, database, collection, page, toast]);

  const copyVisibleDocumentIds = useCallback(() => {
    if (sortedVisibleDocs.length === 0) {
      toast({ title: "No documents", variant: "destructive" });
      return;
    }
    const t = sortedVisibleDocs.map((d) => String(d._id)).join("\n");
    void navigator.clipboard.writeText(t);
    toast({ title: "Copied _id list", description: `${sortedVisibleDocs.length} id(s), one per line` });
  }, [sortedVisibleDocs, toast]);

  const invertDocumentSelection = useCallback(() => {
    const allIds = new Set(sortedVisibleDocs.map((d) => String(d._id)));
    setSelectedDocs((prev) => {
      const next = new Set<string>();
      allIds.forEach((id) => {
        if (!prev.has(id)) next.add(id);
      });
      return next;
    });
    toast({ title: "Selection inverted", description: "Bulk actions apply to the new selection" });
  }, [sortedVisibleDocs, toast]);

  const allFields = useMemo(() => {
    if (schemaData?.fields && schemaData.fields.length > 0) {
      return Array.from(new Set([
        "_id",
        ...schemaData.fields.map((f: any) => f.path)
      ]));
    }
    if (docs.length > 0) {
      return Array.from(new Set(docs.flatMap(d => Object.keys(d)))).slice(0, 50);
    }
    return ["_id"];
  }, [schemaData, docs]);

  const typeColor: Record<string, string> = {
    string: "text-emerald-400", number: "text-amber-400", boolean: "text-violet-400",
    object: "text-blue-400", array: "text-orange-400", null: "text-rose-400",
    objectId: "text-cyan-400", date: "text-pink-400",
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="h-16 border-b border-border flex items-center px-4 gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-bold font-mono text-sm">MongoVision</span>
          <Link href="/" className="ml-auto">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* Saved Queries */}
            {savedQueriesData?.queries && savedQueriesData.queries.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  <BookmarkCheck className="w-3 h-3" />
                  Saved Queries
                </div>
                {savedQueriesData.queries.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-sidebar-accent cursor-pointer group"
                    onClick={() => {
                      const qdata = q.query as { filter?: Record<string, unknown>; sort?: Record<string, unknown>; limit?: number };
                      setQueryFilter(JSON.stringify(qdata.filter || {}, null, 2));
                      setQuerySort(JSON.stringify(qdata.sort || {}, null, 2));
                      setQueryLimit(String(qdata.limit || 20));
                      setActiveTab("query");
                    }}
                  >
                    <Star className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate flex-1">{q.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedQuery.mutate({ queryId: q.id }, {
                          onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedQueriesQueryKey() })
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Databases */}
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <Database className="w-3 h-3" />
              Databases
            </div>

            {dbsLoading ? (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              dbsData?.databases?.map((db) => (
                <div key={db.name}>
                  <div className="group relative">
                    <div
                      onClick={() => {
                        setExpandedDbs(prev => {
                          const next = new Set(prev);
                          if (next.has(db.name)) next.delete(db.name);
                          else next.add(db.name);
                          return next;
                        });
                        setLocation(`/explorer/${connectionId}/${db.name}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setExpandedDbs(prev => {
                            const next = new Set(prev);
                            if (next.has(db.name)) next.delete(db.name);
                            else next.add(db.name);
                            return next;
                          });
                          setLocation(`/explorer/${connectionId}/${db.name}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      data-testid={`db-${db.name}`}
                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-sidebar-accent transition-colors cursor-pointer ${database === db.name ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80"}`}
                    >
                      {expandedDbs.has(db.name) ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                      <Database className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                      <span className="truncate font-mono text-xs flex-1 text-left">{db.name}</span>
                      {db.collectionCount !== undefined && (
                        <span className="text-[10px] text-muted-foreground mr-1">{db.collectionCount}</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDbToDrop(db.name);
                          setShowDropDbModal(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {expandedDbs.has(db.name) && database === db.name && (
                    <div className="ml-3 pl-2 border-l border-border">
                      {colsLoading ? (
                        <div className="space-y-1 py-1">
                          {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
                        </div>
                      ) : (
                        <div className="space-y-0.5 py-1">
                          {colsData?.collections?.map((col) => (
                            <div key={col.name} className="group relative">
                              <div
                                onClick={() => {
                                  setPage(1);
                                  setLocation(`/explorer/${connectionId}/${db.name}/${col.name}`);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    setPage(1);
                                    setLocation(`/explorer/${connectionId}/${db.name}/${col.name}`);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                data-testid={`collection-${col.name}`}
                                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-sidebar-accent transition-colors cursor-pointer ${collection === col.name ? "bg-primary/20 text-primary" : "text-sidebar-foreground/70"}`}
                              >
                                <Layers className="w-3 h-3 shrink-0" />
                                <span className="truncate font-mono flex-1 text-left">{col.name}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setColToDropDb(db.name);
                                    setColToDrop(col.name);
                                    setShowDropColModal(true);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-opacity"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => setShowCreateColModal(true)}
                            className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-sidebar-accent hover:text-primary transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Create Collection</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card shrink-0">
          {connectionId && database && collection ? (
            <>
              <span className="text-muted-foreground text-sm font-mono">{database}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono font-medium">{collection}</span>
              {docsData && (
                <Badge variant="outline" className="text-xs">
                  {docsData.total?.toLocaleString()} docs
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => handleExport("json")}>
                  <Download className="w-3 h-3" /> JSON
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => handleExport("csv")}>
                  <Download className="w-3 h-3" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowImportModal(true)}>
                  <Upload className="w-3 h-3" /> Import
                </Button>
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowInsertModal(true)}>
                  <Plus className="w-3 h-3" /> Insert
                </Button>
              </div>
            </>
          ) : database ? (
            <span className="text-sm font-mono font-medium">{database} — select a collection</span>
          ) : connectionId ? (
            <span className="text-sm text-muted-foreground">Select a database and collection</span>
          ) : (
            <span className="text-sm text-muted-foreground">Select a connection from the sidebar</span>
          )}
        </div>

        {!collection ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Select a collection to explore</p>
              <p className="text-sm mt-1">Navigate the sidebar to get started</p>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="h-10 w-full justify-start rounded-none border-b border-border bg-card px-4 gap-1 shrink-0">
              <TabsTrigger value="dashboard" className="gap-1.5 text-xs h-8" data-testid="tab-dashboard">
                <BarChart3 className="w-3.5 h-3.5" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-xs h-8" data-testid="tab-documents">
                <Table className="w-3.5 h-3.5" /> Documents
              </TabsTrigger>
              <TabsTrigger value="schema" className="gap-1.5 text-xs h-8" data-testid="tab-schema">
                <Layers className="w-3.5 h-3.5" /> Schema
              </TabsTrigger>
              <TabsTrigger value="query" className="gap-1.5 text-xs h-8" data-testid="tab-query">
                <Layers className="w-3.5 h-3.5" /> Aggregations
              </TabsTrigger>
              <TabsTrigger value="indexes" className="gap-1.5 text-xs h-8" data-testid="tab-indexes">
                <Search className="w-3.5 h-3.5" /> Indexes
              </TabsTrigger>
              <TabsTrigger value="performance" className="gap-1.5 text-xs h-8" data-testid="tab-performance">
                <Zap className="w-3.5 h-3.5" /> Performance
              </TabsTrigger>
              <TabsTrigger value="charts" className="gap-1.5 text-xs h-8" data-testid="tab-charts">
                <BarChart3 className="w-3.5 h-3.5" /> Charts
              </TabsTrigger>
            </TabsList>

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard" className="flex-1 overflow-auto m-0">
              <DashboardContent
                connectionId={connectionId}
                database={database}
                collection={collection}
                schemaData={schemaData}
              />
            </TabsContent>

            {/* DOCUMENTS TAB */}
            <TabsContent value="documents" className="flex-1 flex flex-col overflow-hidden m-0">
              {/* ── Query Header ── */}
              <div className="px-4 py-2 border-b border-border bg-card shrink-0 space-y-0">
                {/* Visual / Code + Live / Apply mode */}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                    <button
                      type="button"
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                        docQueryMode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setDocQueryMode("visual")}
                    >
                      <MousePointerClick className="w-2.5 h-2.5" /> Visual
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                        docQueryMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setDocQueryMode("code")}
                    >
                      <Code className="w-2.5 h-2.5" /> Code
                    </button>
                  </div>
                  <div className="flex items-center rounded-md border border-border/50 overflow-hidden" title="When off, the grid updates only after Apply.">
                    <button
                      type="button"
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                        docQueryLive ? "bg-emerald-600/90 text-white" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setDocQueryLive(true)}
                    >
                      <Zap className="w-2.5 h-2.5" /> Live
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                        !docQueryLive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => {
                        setAppliedFilterStr(filterStr);
                        setAppliedSortStr(sortStr);
                        setDocQueryLive(false);
                      }}
                    >
                      <Play className="w-2.5 h-2.5" /> Apply mode
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setDocQueryVisible(!docQueryVisible)}
                    title={docQueryVisible ? "Collapse Query Section" : "Expand Query Section"}
                  >
                    {docQueryVisible ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    {docQueryVisible ? "Collapse" : "Expand"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={handleResetAll}
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Reset All
                  </Button>
                  <div className="flex-1" />
                  {selectedDocs.size > 0 && (
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1" onClick={handleBulkDelete}>
                      <Trash2 className="w-2.5 h-2.5" /> Delete {selectedDocs.size}
                    </Button>
                  )}
                </div>

                {/* Visual query builder */}
                {docQueryVisible && docQueryMode === "visual" && (
                  <VisualQueryBuilder
                    filterValue={filterStr}
                    sortValue={sortStr}
                    onFilterChange={val => setFilterStr(val || "{}")}
                    onSortChange={val => setSortStr(val || "{}")}
                    fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                    liveQuery={docQueryLive}
                    onExecute={(payload) => {
                      setPage(1);
                      if (payload) {
                        setAppliedFilterStr(payload.filter);
                        setAppliedSortStr(payload.sort);
                      }
                      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
                    }}
                    isExecuting={docsLoading}
                    compact
                  />
                )}

                {/* Code query editors */}
                {docQueryVisible && docQueryMode === "code" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">Format</span>
                      <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                        <button
                          type="button"
                          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                            docCodeFormat === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                          }`}
                          onClick={() => setDocCodeFormat("json")}
                        >
                          Strict JSON
                        </button>
                        <button
                          type="button"
                          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                            docCodeFormat === "mongosh" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                          }`}
                          onClick={() => setDocCodeFormat("mongosh")}
                          title="mongosh / CLI style: ObjectId(), ISODate(), unquoted keys, db.coll.find({ ... })"
                        >
                          mongosh (CLI)
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] gap-1 text-muted-foreground"
                        onClick={() => setDocCodeEditorsExpanded((e) => !e)}
                        title={docCodeEditorsExpanded ? "Compact editors" : "Expand editors"}
                      >
                        <ChevronsDownUp className="w-3 h-3" />
                        {docCodeEditorsExpanded ? "Compact" : "Expand"}
                      </Button>
                      <span className="text-[9px] text-muted-foreground hidden md:inline">
                        {docCodeFormat === "mongosh"
                          ? "Shell-style query; Ctrl+Enter runs Apply when in Apply mode."
                          : "Strict JSON; Ctrl+Enter runs Apply when in Apply mode."}
                      </span>
                    </div>
                    {shellQueryBlocked && documentsListParams.parseError && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="font-mono leading-snug">{documentsListParams.parseError}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <QueryEditor
                        value={filterStr === "{}" ? "" : filterStr}
                        onChange={val => setFilterStr(val || "{}")}
                        placeholder={
                          docCodeFormat === "mongosh"
                            ? '{ status: "active" } or db.users.find({ _id: ObjectId("...") })'
                            : 'Filter: { "field": "value" }'
                        }
                        fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                        height={
                          docCodeEditorsExpanded
                            ? docCodeFormat === "mongosh"
                              ? "260px"
                              : "220px"
                            : docCodeFormat === "mongosh"
                              ? "100px"
                              : "88px"
                        }
                        className="flex-1 min-w-0 w-full"
                        mode="filter"
                        syntax={docCodeFormat === "mongosh" ? "mongosh" : "json"}
                        onExecute={
                          docQueryLive
                            ? () =>
                                queryClient.invalidateQueries({
                                  queryKey: getListDocumentsQueryKey(connectionId, database, collection),
                                })
                            : applyDocumentQuery
                        }
                      />
                      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-end">
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground min-[520px]:hidden">
                          <SortAsc className="w-3 h-3 shrink-0" /> Sort
                        </div>
                        <QueryEditor
                          value={sortStr === "{}" ? "" : sortStr}
                          onChange={val => setSortStr(val || "{}")}
                          placeholder={
                            docCodeFormat === "mongosh"
                              ? "{ createdAt: -1 }"
                              : 'Sort: { "field": -1 }'
                          }
                          fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                          height={
                            docCodeEditorsExpanded
                              ? docCodeFormat === "mongosh"
                                ? "120px"
                                : "100px"
                              : docCodeFormat === "mongosh"
                                ? "72px"
                                : "64px"
                          }
                          className="flex-1 min-w-0 w-full min-[520px]:max-w-xs"
                          mode="sort"
                          syntax={docCodeFormat === "mongosh" ? "mongosh" : "json"}
                          onExecute={
                            docQueryLive
                              ? () =>
                                  queryClient.invalidateQueries({
                                    queryKey: getListDocumentsQueryKey(connectionId, database, collection),
                                  })
                              : applyDocumentQuery
                          }
                        />
                        {!docQueryLive && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 text-[10px] gap-1 shrink-0"
                            type="button"
                            onClick={applyDocumentQuery}
                          >
                            <Play className="w-2.5 h-2.5" /> Apply query
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Feature Toolbar ── */}
              <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/50 bg-muted/20 shrink-0 flex-wrap">
                {/* View mode */}
                <div className="flex items-center rounded-md border border-border/40 overflow-hidden">
                  <button
                    className={`px-1.5 py-0.5 transition-colors ${viewMode === "json" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setViewMode("json")} title="JSON view"
                  >
                    <FileJson className="w-3 h-3" />
                  </button>
                  <button
                    className={`px-1.5 py-0.5 transition-colors ${viewMode === "card" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setViewMode("card")} title="Card view"
                  >
                    <LayoutGrid className="w-3 h-3" />
                  </button>
                  <button
                    className={`px-1.5 py-0.5 transition-colors ${viewMode === "spreadsheet" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setViewMode("spreadsheet")} title="Spreadsheet — fixed # / actions, resizable columns & rows"
                  >
                    <Grid3x3 className="w-3 h-3" />
                  </button>
                </div>

                {/* Column visibility */}
                <div className="relative">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowColumnManager(!showColumnManager)}>
                    <Columns className="w-2.5 h-2.5" /> Columns
                  </Button>
                  {showColumnManager && (
                    <div className="absolute top-7 left-0 z-50 bg-card border border-border rounded-md shadow-lg p-2 w-48 max-h-64 overflow-auto">
                      <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Show/Hide Columns</p>
                      {allFields.map(f => (
                        <label key={f} className="flex items-center gap-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-muted/30 px-1 rounded">
                          <input
                            type="checkbox"
                            className="rounded w-3 h-3"
                            checked={!hiddenColumns.has(f)}
                            onChange={e => {
                              setHiddenColumns(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.delete(f); else next.add(f);
                                return next;
                              });
                            }}
                          />
                          <span className="font-mono truncate">{f}</span>
                        </label>
                      ))}
                      {hiddenColumns.size > 0 && (
                        <Button variant="ghost" size="sm" className="w-full h-5 text-[9px] mt-1" onClick={() => setHiddenColumns(new Set())}>
                          Show All
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Compare */}
                <Button
                  variant={compareMode ? "default" : "ghost"} size="sm" className="h-6 text-[10px] gap-1"
                  onClick={() => { setCompareMode(!compareMode); setCompareDocs([]); }}
                >
                  <Diff className="w-2.5 h-2.5" /> Compare
                  {compareMode && compareDocs.length > 0 && <span className="ml-0.5">({compareDocs.length}/2)</span>}
                </Button>

                {docs.length > 0 && (
                  <>
                    <Badge variant="secondary" className="h-6 px-2 text-[10px] font-normal tabular-nums">
                      {sortedVisibleDocs.length} shown
                    </Badge>
                    <Badge variant="outline" className="h-6 px-2 text-[10px] font-normal text-muted-foreground tabular-nums hidden sm:inline-flex" title="Approx. JSON size of visible rows">
                      {visibleJsonPayloadBytes >= 1024
                        ? `${(visibleJsonPayloadBytes / 1024).toFixed(1)} KB`
                        : `${visibleJsonPayloadBytes} B`}
                    </Badge>
                  </>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  title="Download visible documents as JSON"
                  onClick={exportVisibleDocumentsJson}
                  disabled={sortedVisibleDocs.length === 0}
                >
                  <Download className="w-2.5 h-2.5" /> Export
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  title="Copy all visible _id values (one per line)"
                  onClick={copyVisibleDocumentIds}
                  disabled={sortedVisibleDocs.length === 0}
                >
                  <ListTree className="w-2.5 h-2.5" /> Copy IDs
                </Button>
                {(viewMode === "table" || viewMode === "spreadsheet") && !compareMode && sortedVisibleDocs.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    title="Invert bulk selection on this page"
                    onClick={invertDocumentSelection}
                  >
                    Invert sel.
                  </Button>
                )}

                <div className="w-px h-4 bg-border/30" />

                {/* Quick search */}
                <div className="flex items-center gap-1 bg-muted/30 rounded px-1.5 border border-border/30" title="Focus: ⌘K / Ctrl+K">
                  <Search className="w-2.5 h-2.5 text-muted-foreground" />
                  <input
                    data-doc-page-search
                    type="text" value={localSearch}
                    onChange={e => setLocalSearch(e.target.value)}
                    placeholder="Search… ⌘K"
                    className="bg-transparent text-[10px] w-24 md:w-28 outline-none placeholder:text-muted-foreground/50 py-0.5"
                  />
                  {localSearch && (
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => setLocalSearch("")}>
                      <XCircle className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                <div className="flex-1" />

                {/* Auto-refresh */}
                <div className="flex items-center gap-1">
                  <Timer className="w-2.5 h-2.5 text-muted-foreground" />
                  <select
                    value={autoRefreshInterval}
                    onChange={e => setAutoRefreshInterval(Number(e.target.value))}
                    className="bg-transparent text-[10px] text-muted-foreground border-none outline-none cursor-pointer"
                  >
                    <option value={0}>Off</option>
                    <option value={5}>5s</option>
                    <option value={10}>10s</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                  </select>
                  {autoRefreshInterval > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
              </div>

              {/* ── Compare Diff View ── */}
              {compareMode && compareDocs.length === 2 && (() => {
                const docA = docs.find(d => String(d._id) === compareDocs[0]);
                const docB = docs.find(d => String(d._id) === compareDocs[1]);
                if (!docA || !docB) return null;
                const allKeys = Array.from(new Set([...Object.keys(docA), ...Object.keys(docB)]));
                return (
                  <div className="border-b border-border bg-muted/10 shrink-0">
                    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/30">
                      <Diff className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] font-medium text-violet-400">Comparing 2 documents</span>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={() => { setCompareDocs([]); setCompareMode(false); }}>
                        <X className="w-2.5 h-2.5" /> Close
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-0 max-h-[min(50vh,28rem)] overflow-auto">
                      {allKeys.map(key => {
                        const vA = JSON.stringify(docA[key] ?? null);
                        const vB = JSON.stringify(docB[key] ?? null);
                        const isDiff = vA !== vB;
                        return (
                          <div key={key} className="contents">
                            <div className={`px-4 py-0.5 text-[10px] font-mono border-b border-r border-border/20 ${isDiff ? "bg-red-500/5" : ""}`}>
                              <span className="text-muted-foreground mr-1">{key}:</span>
                              <span className={isDiff ? "text-red-400" : ""}>{String(docA[key] ?? "—").slice(0, 60)}</span>
                            </div>
                            <div className={`px-4 py-0.5 text-[10px] font-mono border-b border-border/20 ${isDiff ? "bg-green-500/5" : ""}`}>
                              <span className="text-muted-foreground mr-1">{key}:</span>
                              <span className={isDiff ? "text-green-400" : ""}>{String(docB[key] ?? "—").slice(0, 60)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Document Content ── */}
              <div
                ref={documentsContentRef}
                onScroll={handleDocContentScroll}
                className="flex-1 overflow-auto relative"
                onClick={() => { if (showColumnManager) setShowColumnManager(false); }}
              >
                {docsError && (
                  <div className="p-4 flex items-center gap-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Failed to load documents: {(docsError as any).message || String(docsError)}</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs ml-auto border-destructive/30 hover:bg-destructive/10" onClick={() => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) })}>
                      Retry
                    </Button>
                  </div>
                )}
                {docsLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : docs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <FileJson className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No documents found</p>
                    </div>
                  </div>
                ) : (() => {
                  const visibleFields = allFields.filter(f => !hiddenColumns.has(f));
                  const sortedDocs = sortedVisibleDocs;

                  // ─── JSON View ───
                  if (viewMode === "json") {
                    return (
                      <DocumentsJsonView
                        docs={sortedDocs as Record<string, unknown>[]}
                        pinnedDocIds={pinnedDocs}
                        onTogglePin={(id) =>
                          setPinnedDocs((prev) => {
                            const n = new Set(prev);
                            if (n.has(id)) n.delete(id);
                            else n.add(id);
                            return n;
                          })
                        }
                        onCopy={handleCopyDoc}
                        onDuplicate={handleDuplicateDoc}
                        searchQuery={localSearch}
                        onOpenDocument={openFullDocumentJsonModal}
                        compareMode={compareMode}
                        compareDocs={compareDocs}
                        onToggleCompare={(docId, checked) =>
                          setCompareDocs((prev) => {
                            if (!checked) return prev.filter((x) => x !== docId);
                            if (prev.includes(docId)) return prev;
                            if (prev.length >= 2) return prev;
                            return [...prev, docId];
                          })
                        }
                      />
                    );
                  }

                  // ─── Card View ───
                  if (viewMode === "card") {
                    return (
                      <DocumentsCardView
                        docs={sortedDocs}
                        visibleFields={visibleFields}
                        pinnedDocIds={pinnedDocs}
                        onTogglePin={(id) =>
                          setPinnedDocs((prev) => {
                            const n = new Set(prev);
                            if (n.has(id)) n.delete(id);
                            else n.add(id);
                            return n;
                          })
                        }
                        onCopy={handleCopyDoc}
                        onDuplicate={handleDuplicateDoc}
                        onQuickFilter={handleQuickFilter}
                        onOpenDocument={openFullDocumentJsonModal}
                        compareMode={compareMode}
                        compareDocs={compareDocs}
                        onToggleCompare={(docId, checked) =>
                          setCompareDocs((prev) => {
                            if (!checked) return prev.filter((x) => x !== docId);
                            if (prev.includes(docId)) return prev;
                            if (prev.length >= 2) return prev;
                            return [...prev, docId];
                          })
                        }
                      />
                    );
                  }

                  // ─── Spreadsheet View (default) ───
                  return (
                    <DocumentsSpreadsheetView
                      docs={sortedDocs}
                      visibleFields={visibleFields}
                      layout={spreadsheetLayout}
                      onLayoutChange={setSpreadsheetLayout}
                      handlers={{
                        onOpenFullDocument: openFullDocumentJsonModal,
                        onCopy: handleCopyDoc,
                        onDuplicate: handleDuplicateDoc,
                        onPin: (docId) =>
                          setPinnedDocs((prev) => {
                            const n = new Set(prev);
                            if (n.has(docId)) n.delete(docId);
                            else n.add(docId);
                            return n;
                          }),
                        isPinned: (id) => pinnedDocs.has(id),
                        onEdit: (docId, doc) => {
                          setEditDocId(docId);
                          const { _id: _oid, ...rest } = doc;
                          setEditJson(JSON.stringify(rest, null, 2));
                          setShowEditModal(true);
                        },
                        onDelete: (docId) => {
                          setDocToDelete(docId);
                          setShowSingleDeleteConfirm(true);
                        },
                        compareMode,
                        compareDocs,
                        onToggleCompare: (docId, checked) =>
                          setCompareDocs((prev) => {
                            if (!checked) return prev.filter((x) => x !== docId);
                            if (prev.includes(docId)) return prev;
                            if (prev.length >= 2) return prev;
                            return [...prev, docId];
                          }),
                        selectedDocs,
                        onToggleSelect: (docId, checked) =>
                          setSelectedDocs((prev) => {
                            const n = new Set(prev);
                            if (checked) n.add(docId);
                            else n.delete(docId);
                            return n;
                          }),
                        onSelectAll: (checked, ids) =>
                          setSelectedDocs(checked ? new Set(ids) : new Set()),
                        inlineEditCell,
                        onInlineEdit: handleInlineEdit,
                        setInlineEditCell,
                      }}
                    />
                  );
                })()}
                {docScrollShowTop && docs.length > 0 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="fixed bottom-6 right-6 z-40 h-9 w-9 rounded-full shadow-lg border border-border/60 opacity-90 hover:opacity-100"
                    onClick={scrollDocumentsToTop}
                    title="Back to top"
                  >
                    <ArrowUpToLine className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Pagination */}
              {docsData && docsData.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {((page - 1) * limit) + 1}–{Math.min(page * limit, docsData.total)} of {docsData.total?.toLocaleString()}
                    </span>
                    {docsData.executionTimeMs !== undefined && (
                      <Badge variant="outline" className="text-xs">{docsData.executionTimeMs}ms</Badge>
                    )}
                    {localSearch && (
                      <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">
                        Filtered: {(() => {
                          const q = localSearch.toLowerCase();
                          return docs.filter(doc => Object.values(doc).some(v => String(v ?? "").toLowerCase().includes(q))).length;
                        })()} shown
                      </Badge>
                    )}
                    {pinnedDocs.size > 0 && (
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                        {pinnedDocs.size} pinned
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-7 text-xs w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs">{page} / {docsData.totalPages}</span>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= docsData.totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRightIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* SCHEMA TAB */}
            <TabsContent value="schema" className="flex-1 overflow-auto m-0 p-4">
              {schemaLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : schemaData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Sample: <strong className="text-foreground">{schemaData.sampleSize}</strong> docs</span>
                      <span>Total: <strong className="text-foreground">{schemaData.documentCount?.toLocaleString()}</strong></span>
                      <span>Fields: <strong className="text-foreground">{schemaData.fields?.length}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => refetchSchema()}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => setIsEditingValidation(true)}
                      >
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        Manage Validation
                      </Button>
                    </div>
                  </div>

                  {schemaData.inconsistencies && schemaData.inconsistencies.length > 0 && (
                    <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/10">
                      <p className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" /> Schema Inconsistencies
                      </p>
                      {schemaData.inconsistencies.map((inc, i) => (
                        <div key={i} className="text-xs text-amber-300/80 font-mono">
                          {inc.field}: {inc.issue}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    {schemaData.fields?.map((field) => (
                      <div key={field.path} className="border border-border rounded-lg p-3 hover:border-border/80">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-mono font-medium ${typeColor[field.type] || "text-foreground"}`}>
                            {field.name}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {field.types?.join(" | ") || field.type}
                          </Badge>
                          {field.isArray && <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-400">array</Badge>}
                          {field.nullable && <Badge variant="outline" className="text-xs border-rose-500/40 text-rose-400">nullable</Badge>}
                          <div className="ml-auto flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${(field.prevalence || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">
                              {Math.round((field.prevalence || 0) * 100)}%
                            </span>
                          </div>
                        </div>
                        {field.sampleValues && field.sampleValues.length > 0 && (
                          <div className="mt-1 flex gap-2">
                            {field.sampleValues.slice(0, 3).map((v, i) => (
                              <span key={i} className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {String(v).slice(0, 30)}
                              </span>
                            ))}
                          </div>
                        )}
                        {field.children && field.children.length > 0 && (
                          <div className="ml-4 mt-2 pl-2 border-l border-border space-y-1">
                            {field.children.map(child => (
                              <div key={child.path} className="flex items-center gap-2 text-xs">
                                <span className={`font-mono ${typeColor[child.type] || "text-foreground"}`}>{child.name}</span>
                                <Badge variant="outline" className="text-xs">{child.type}</Badge>
                                <span className="text-muted-foreground ml-auto">{Math.round((child.prevalence || 0) * 100)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Click Schema tab to analyze</p>
                </div>
              )}
            </TabsContent>

            {/* AGGREGATIONS TAB */}
            <TabsContent value="query" className="flex-1 flex overflow-hidden m-0">
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* ── Toolbar ── */}
                <div className="flex items-center gap-2 flex-wrap">
                  <QueryTemplates
                    onSelectFilter={(t) => setQueryFilter(t)}
                    onSelectAggregate={(t) => setAggregatePipeline(t)}
                  />
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowHistory(!showHistory)}>
                    <Clock className="w-3.5 h-3.5" />
                    History
                  </Button>
                </div>

                {/* ── Aggregation Pipeline Builder ── */}
                <AggregationPipelineBuilder
                  value={aggregatePipeline}
                  onChange={v => setAggregatePipeline(v)}
                  fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                  onExecute={handleRunAggregate}
                />

                <div className="flex items-center gap-3">
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleRunAggregate} disabled={executeAggregate.isPending}>
                    {executeAggregate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run Aggregate
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleExplain} disabled={explainQuery.isPending}>
                    <Eye className="w-3.5 h-3.5" /> Explain
                  </Button>
                </div>

                {/* ── Results Stats ── */}
                {queryTime !== null && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{queryTime}ms</Badge>
                    <span className="text-xs text-muted-foreground">{queryResults?.length || 0} results</span>
                  </div>
                )}

                {/* ── Results ── */}
                {queryResults && queryResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="divide-y divide-border max-h-[50vh] overflow-auto">
                      {queryResults.map((doc, i) => (
                        <div key={i} className="px-4 py-2 font-mono text-xs hover:bg-muted/20">
                          <JsonTree data={doc} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Explain Results ── */}
                {explainResult && (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium">Execution Plan</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`p-3 rounded-lg border ${(explainResult.collectionScans as number) > 0 ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                        <p className="text-xs text-muted-foreground">Scan Type</p>
                        <p className={`text-sm font-medium ${(explainResult.collectionScans as number) > 0 ? "text-red-400" : "text-green-400"}`}>
                          {(explainResult.collectionScans as number) > 0 ? "COLLSCAN" : "IXSCAN"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Docs Examined</p>
                        <p className="text-sm font-medium">{String(explainResult.totalDocsExamined || 0)}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Keys Examined</p>
                        <p className="text-sm font-medium">{String(explainResult.totalKeysExamined || 0)}</p>
                      </div>
                    </div>
                    {(explainResult.indexesUsed as string[])?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Indexes Used</p>
                        <div className="flex gap-2">
                          {(explainResult.indexesUsed as string[]).map(idx => (
                            <Badge key={idx} variant="outline" className="text-xs border-green-500/40 text-green-400">{idx}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── History Sidebar ── */}
              {showHistory && (
                <div className="w-72 shrink-0">
                  <QueryHistory
                    database={database}
                    collection={collection}
                    onSelect={(entry) => {
                      if (entry.type === "find") {
                        setQueryFilter(entry.query);
                      } else {
                        setAggregatePipeline(entry.query);
                      }
                      setShowHistory(false);
                    }}
                    onClose={() => setShowHistory(false)}
                  />
                </div>
              )}
            </TabsContent>


            {/* INDEXES TAB */}
            <TabsContent value="indexes" className="flex-1 overflow-auto m-0 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Indexes</h3>
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowIndexModal(true)}>
                  <Plus className="w-3.5 h-3.5" /> Create Index
                </Button>
              </div>
              {indexLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {indexData?.indexes?.map((idx) => (
                    <div key={idx.name} className="border border-border rounded-lg px-4 py-3 flex items-center gap-3 hover:border-border/80">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono font-medium">{idx.name}</span>
                          {idx.unique && <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-400">unique</Badge>}
                          {idx.sparse && <Badge variant="outline" className="text-xs">sparse</Badge>}
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">{JSON.stringify(idx.key)}</span>
                      </div>
                      {idx.name !== "_id_" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDropIndex(idx.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!indexData?.indexes?.length && (
                    <div className="text-center py-8 text-muted-foreground text-sm">No indexes found</div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* PERFORMANCE TAB */}
            <TabsContent value="performance" className="flex-1 overflow-auto m-0 p-4">
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" /> Query Explain & Index Suggestions
                  </h3>
                  <div className="space-y-2 mb-3">
                    <label className="text-xs text-muted-foreground">Filter (from Query tab)</label>
                    <Input
                      value={queryFilter}
                      onChange={e => setQueryFilter(e.target.value)}
                      className="font-mono text-xs h-8"
                      placeholder='{ "field": "value" }'
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExplain} disabled={explainQuery.isPending}>
                      {explainQuery.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      Explain Query
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={async () => {
                        try {
                          const result = await suggestIndexes.mutateAsync({
                            connectionId, dbName: database, collectionName: collection,
                            data: { filter: parseFilter(queryFilter) }
                          });
                          toast({ title: `${result.suggestions?.length || 0} index suggestions` });
                        } catch (err: any) {
                          toast({ title: "Suggestion failed", description: err.message, variant: "destructive" });
                        }
                      }}
                      disabled={suggestIndexes.isPending}
                    >
                      <Search className="w-3.5 h-3.5" /> Suggest Indexes
                    </Button>
                  </div>
                </div>

                {explainResult && (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium">Execution Stats</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-lg border ${(explainResult.collectionScans as number) > 0 ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                        {(explainResult.collectionScans as number) > 0 ? (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <div>
                              <p className="text-xs text-muted-foreground">Collection Scan</p>
                              <p className="text-sm font-medium text-red-400">No index used</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <div>
                              <p className="text-xs text-muted-foreground">Index Scan</p>
                              <p className="text-sm font-medium text-green-400">Index used</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Execution Time</p>
                        <p className="text-lg font-mono font-bold">{String(explainResult.executionTimeMs || 0)}ms</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Documents Examined</p>
                        <p className="text-lg font-mono font-bold">{String(explainResult.totalDocsExamined || 0)}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Index Keys Examined</p>
                        <p className="text-lg font-mono font-bold">{String(explainResult.totalKeysExamined || 0)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {suggestIndexes.data && (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium">Index Suggestions</h4>
                    {suggestIndexes.data.suggestions?.map((s, i) => (
                      <div key={i} className="border border-border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Search className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm font-medium">{s.fields.join(", ")}</span>
                          <Badge variant="outline" className="text-xs">{s.estimatedImpact.split("—")[0].trim()}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{s.reason}</p>
                        <code className="text-xs font-mono text-primary/80 bg-muted px-2 py-1 rounded block">{s.createCommand}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* CHARTS TAB */}
            <TabsContent value="charts" className="flex-1 flex flex-col overflow-hidden m-0 p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={chartType} onValueChange={setChartType}>
                    <SelectTrigger className="h-8 text-xs w-28" data-testid="select-chart-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar Chart</SelectItem>
                      <SelectItem value="line">Line Chart</SelectItem>
                      <SelectItem value="pie">Pie Chart</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">X Axis</label>
                    <Input value={chartXField} onChange={e => setChartXField(e.target.value)} placeholder="field name" className="h-8 text-xs w-32 font-mono" data-testid="input-chart-x" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Y Axis</label>
                    <Input value={chartYField} onChange={e => setChartYField(e.target.value)} placeholder="field name" className="h-8 text-xs w-32 font-mono" data-testid="input-chart-y" />
                  </div>
                  <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleRunChart}>
                    <Play className="w-3.5 h-3.5" /> Load Data
                  </Button>
                </div>

                {chartData && chartXField && chartYField ? (
                  <div className="border border-border rounded-lg p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === "pie" ? (
                        <PieChart>
                          <Pie data={chartData.slice(0, 20)} dataKey={chartYField} nameKey={chartXField} cx="50%" cy="50%" outerRadius={100} label>
                            {chartData.slice(0, 20).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                          <Legend />
                        </PieChart>
                      ) : chartType === "line" ? (
                        <LineChart data={chartData.slice(0, 50)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey={chartXField} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Line type="monotone" dataKey={chartYField} stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      ) : (
                        <BarChart data={chartData.slice(0, 30)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey={chartXField} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey={chartYField} fill="#10b981" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg h-72 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>Set X and Y fields, then click Load Data</p>
                    </div>
                  </div>
                )}

                {chartData && (
                  <div className="text-xs text-muted-foreground">
                    Showing {Math.min(chartData.length, 50)} of {chartData.length} documents
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Insert Modal */}
      <Dialog open={showInsertModal} onOpenChange={setShowInsertModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Insert Document</DialogTitle>
          </DialogHeader>
          <Textarea
            value={insertJson}
            onChange={e => setInsertJson(e.target.value)}
            className="font-mono text-xs h-64 resize-none"
            data-testid="textarea-insert-doc"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInsertModal(false)}>Cancel</Button>
            <Button onClick={handleInsert} disabled={insertDoc.isPending} data-testid="button-insert-confirm">
              {insertDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Insert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground font-mono">_id: {editDocId}</p>
          <Textarea
            value={editJson}
            onChange={e => setEditJson(e.target.value)}
            className="font-mono text-xs h-64 resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updateDoc.isPending}>
              {updateDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentJsonModal
        open={!!fullDocumentJsonModal}
        onOpenChange={(open) => {
          if (!open) setFullDocumentJsonModal(null);
        }}
        docId={fullDocumentJsonModal?.docId ?? ""}
        draft={fullDocumentJsonModal?.draft ?? ""}
        onDraftChange={(next) =>
          setFullDocumentJsonModal((prev) => (prev ? { ...prev, draft: next } : prev))
        }
        initialJson={fullDocumentJsonModal?.initialJson ?? ""}
        onSave={() => void handleFullDocumentJsonModalSave()}
        isSaving={updateDoc.isPending}
      />

      {/* Single Delete Confirmation */}
      <Dialog open={showSingleDeleteConfirm} onOpenChange={setShowSingleDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Delete Document
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            Are you sure you want to delete this document? This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSingleDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (docToDelete) handleDeleteDoc(docToDelete);
              setShowSingleDeleteConfirm(false);
              setDocToDelete(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Index Modal */}
      <Dialog open={showIndexModal} onOpenChange={setShowIndexModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Index</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Keys (JSON)</label>
              <Textarea value={newIndexKeys} onChange={e => setNewIndexKeys(e.target.value)} placeholder='{ "field": 1 }' className="font-mono text-xs h-20 mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="unique-idx" checked={newIndexUnique} onChange={e => setNewIndexUnique(e.target.checked)} />
              <label htmlFor="unique-idx" className="text-sm">Unique</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIndexModal(false)}>Cancel</Button>
            <Button onClick={handleCreateIndex} disabled={createIndex.isPending}>
              {createIndex.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Query Modal */}
      <Dialog open={showSaveQueryModal} onOpenChange={setShowSaveQueryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
          </DialogHeader>
          <Input placeholder="Query name" value={saveQueryName} onChange={e => setSaveQueryName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveQueryModal(false)}>Cancel</Button>
            <Button onClick={handleSaveQuery} disabled={!saveQueryName || saveQuery.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={importFormat} onValueChange={v => setImportFormat(v as "json" | "csv")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={importData}
              onChange={e => setImportData(e.target.value)}
              className="font-mono text-xs h-48 resize-none"
              placeholder={importFormat === "json" ? '[{"name": "example", "value": 42}]' : 'name,value\nexample,42'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                try {
                  const result = await importCol.mutateAsync({
                    connectionId, dbName: database, collectionName: collection,
                    data: { format: importFormat, data: importData }
                  });
                  queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
                  setShowImportModal(false);
                  toast({ title: `Imported ${result.insertedCount} documents` });
                } catch (err: any) {
                  toast({ title: "Import failed", description: err.message, variant: "destructive" });
                }
              }}
              disabled={!importData}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Collection Modal */}
      <Dialog open={showCreateColModal} onOpenChange={setShowCreateColModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Database: <span className="font-mono">{database}</span></p>
            <Input placeholder="Collection name" value={newColName} onChange={e => setNewColName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateColModal(false)}>Cancel</Button>
            <Button onClick={handleCreateCollection} disabled={!newColName || createCol.isPending}>
              {createCol.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Database Modal */}
      <Dialog open={showDropDbModal} onOpenChange={setShowDropDbModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Drop Database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Are you sure you want to drop the database <strong className="font-mono text-destructive">{dbToDrop}</strong>?</p>
            <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded border border-destructive/20">
              This action is permanent and will delete all collections and data in this database.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDropDbModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDropDatabase} disabled={dropDb.isPending}>
              {dropDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Drop Database"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Collection Modal */}
      <Dialog open={showDropColModal} onOpenChange={setShowDropColModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Drop Collection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Are you sure you want to drop the collection <strong className="font-mono text-destructive">{colToDrop}</strong> from <strong className="font-mono">{colToDropDb}</strong>?</p>
            <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded border border-destructive/20">
              This action is permanent and will delete all documents and indexes in this collection.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDropColModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDropCollection} disabled={dropCol.isPending}>
              {dropCol.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Drop Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function DashboardContent({ connectionId, database, collection, schemaData }: {
  connectionId: string;
  database: string;
  collection: string;
  schemaData: any;
}) {
  const executeAggregate = useExecuteAggregate();
  const [charts, setCharts] = useState<{ field: string; type: string; data: any[] }[]>([]);
  const [loading, setLoading] = useState(false);

  const generateCharts = useCallback(async () => {
    if (!schemaData?.fields || loading) return;
    setLoading(true);
    const newCharts: { field: string; type: string; data: any[] }[] = [];

    // Prioritize fields for charts
    const chartableFields = schemaData.fields
      .filter((f: any) => f.path !== "_id" && (f.type === "string" || f.type === "number" || f.type === "boolean" || f.type === "date"))
      .slice(0, 5); // Limit to top 5 interesting fields

    for (const field of chartableFields) {
      try {
        let pipeline: any[] = [];
        let chartType = "bar";

        if (field.type === "date") {
          chartType = "line";
          pipeline = [
            { $match: { [field.path]: { $ne: null } } },
            { $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: `$${field.path}` }
                },
                count: { $sum: 1 }
            } },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ];
        } else {
          chartType = field.type === "string" || field.type === "boolean" ? "pie" : "bar";
          pipeline = [
            { $match: { [field.path]: { $ne: null } } },
            { $group: { _id: `$${field.path}`, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ];
        }

        const result = await executeAggregate.mutateAsync({
          connectionId, dbName: database, collectionName: collection,
          data: { pipeline }
        });

        if (result.documents && result.documents.length > 0) {
          newCharts.push({
            field: field.path,
            type: chartType,
            data: result.documents.map((d: any) => ({
              name: String(d._id === null ? "null" : d._id),
              value: d.count
            }))
          });
        }
      } catch (err) {
        console.error(`Failed to generate chart for ${field.path}:`, err);
      }
    }

    setCharts(newCharts);
    setLoading(false);
  }, [schemaData, connectionId, database, collection]);

  useEffect(() => {
    generateCharts();
  }, [schemaData]);

  if (!schemaData && !loading) return <div className="p-8 text-center text-muted-foreground">Analyze schema first to see dashboard</div>;
  if (loading && charts.length === 0) return <div className="p-8 space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Collection Dashboard</h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8"
          onClick={generateCharts}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Dashboard
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {charts.map((chart, idx) => (
        <div key={idx} className="bg-card border border-border p-4 rounded-lg shadow-sm">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Distribution of <span className="font-mono text-primary">{chart.field}</span>
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === "pie" ? (
                <PieChart>
                  <Pie
                    data={chart.data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    label={false}
                  >
                    {chart.data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: any, name: any, props: any) => {
                      const total = chart.data.reduce((acc, d) => acc + d.value, 0);
                      const percent = ((value / total) * 100).toFixed(1);
                      return [`${value} (${percent}%)`, name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }}
                    iconSize={8}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                </PieChart>
              ) : chart.type === "line" ? (
                <LineChart data={chart.data} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted)/0.2)" />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              ) : (
                <BarChart data={chart.data} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted)/0.2)" />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ))}
      {charts.length === 0 && !loading && (
        <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-xl">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">No chartable fields detected in this collection.</p>
        </div>
      )}
      </div>
    </div>
  );
}
