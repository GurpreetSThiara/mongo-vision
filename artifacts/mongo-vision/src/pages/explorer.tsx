import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDatabases,
  useListCollections,
  useListDocuments,
  useAnalyzeSchema,
  useListIndexes,
  useListSavedQueries,
  useDropCollection,
  useDropDatabase,
  useCreateCollection,
  useExecuteAggregate,
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
  Layers, Zap, Plus, Trash2, RefreshCw, Download,
  Upload, Search, BookmarkCheck, FileJson, Play,
  Filter, SortAsc, Star, ChevronLeft, ChevronRightIcon, Loader2,
  AlertCircle, CheckCircle, XCircle, Eye, Clock, MousePointerClick,
  Copy, Columns, LayoutGrid, Timer, Pin, ArrowLeft,
  LayoutList, FileText, Diff, X, Shield, ChevronsDownUp, Grid3x3,
  ArrowUpToLine, ListTree, ChevronUp, Menu, MoreVertical,
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
import { ServerPerformanceDashboard } from "@/components/ServerPerformanceDashboard";
import { NoSqlSchemaBuilder } from "@/components/NoSqlSchemaBuilder";
import { MonacoJsonEditor } from "@/components/MonacoJsonEditor";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mongoshDocumentToObject } from "@/lib/mongoshQuery";
import { ExplorerSidebar } from "@/components/app/ExplorerSidebar";
import { ExplorerHeader } from "@/components/app/ExplorerHeader";
import { MobileHeader } from "@/components/app/MobileHeader";
import { MobileSidebarDrawer } from "@/components/app/MobileSidebarDrawer";
import { MobileBottomNav, type MobileNavTab } from "@/components/app/MobileBottomNav";
import { CollectionTabBar } from "@/components/app/CollectionTabBar";
import { useExplorerState } from "@/hooks/use-explorer-state";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useQueryActions } from "@/hooks/use-query-actions";
import { useImportExport } from "@/hooks/use-import-export";
import { useIndexManager } from "@/hooks/use-index-manager";
import { useIsMobile } from "@/hooks/use-mobile";
import { CHART_COLORS, IMPORT_MAX_FILE_BYTES, IMPORT_PREVIEW_MAX_BYTES } from "@/constants";
import { TOAST, TOAST_DESC, LABEL, MODAL_TITLE, CONFIRM_MSG } from "@/constants/messages";
import { formatBytes, formatDocCount, formatPageRange, formatPayloadSize } from "@/utils/format";
import { getBsonTypeTextColor } from "@/utils/bson";

// ─── Local sub-components (still defined here as they're tightly coupled) ──────

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
          <span className="text-gray-400">{"{"}&hellip;{"}"}</span>
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

function SchemaFieldVisualizer({ field }: { field: any }) {
  const samples = field.sampleValues || [];
  if (samples.length === 0) return null;

  const types = field.types || [field.type];
  const hasMultipleTypes = types.length > 1;
  const totalSamples = samples.length;

  const typeColorMap: Record<string, string> = {
    String: "bg-emerald-500", Number: "bg-amber-500", Boolean: "bg-violet-500",
    Object: "bg-blue-500", Array: "bg-orange-500", Objectid: "bg-cyan-500",
    Date: "bg-pink-500", Null: "bg-rose-500",
  };
  const typeTextColorMap: Record<string, string> = {
    String: "text-emerald-400", Number: "text-amber-400", Boolean: "text-violet-400",
    Object: "text-blue-400", Array: "text-orange-400", Objectid: "text-cyan-400",
    Date: "text-pink-400", Null: "text-rose-400",
  };

  const typeCounts: Record<string, number> = {};
  samples.forEach((v: any) => {
    let t: string = typeof v;
    if (v === null) t = "null";
    else if (v instanceof Date || (typeof v === "string" && !isNaN(Date.parse(v)) && v.includes("T"))) t = "date";
    else if (typeof v === "object" && v?.$oid) t = "objectid";
    else if (Array.isArray(v)) t = "array";
    const typeName = t.charAt(0).toUpperCase() + t.slice(1);
    typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
  });

  const renderTypeSegments = () => {
    if (!hasMultipleTypes) return null;
    return (
      <div className="space-y-1.5 mt-2">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Type Distribution</span>
        <div className="w-full h-2 rounded-full bg-muted flex overflow-hidden">
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} className={`h-full ${typeColorMap[type] || "bg-primary"}`}
              style={{ width: `${(count / totalSamples) * 100}%` }} title={`${type}: ${Math.round((count / totalSamples) * 100)}%`} />
          ))}
        </div>
      </div>
    );
  };

  const primaryType = field.type.toLowerCase();

  if (primaryType === "boolean") {
    let trues = 0, falses = 0;
    samples.forEach((v: any) => { if (v === true || String(v) === "true") trues++; else falses++; });
    const truePct = totalSamples > 0 ? (trues / totalSamples) * 100 : 0;
    const falsePct = totalSamples > 0 ? (falses / totalSamples) * 100 : 0;
    return (
      <div className="mt-3 space-y-2 border-t border-border/40 pt-2.5">
        {renderTypeSegments()}
        <div className="w-full h-3 rounded bg-muted overflow-hidden flex">
          <div className="h-full bg-violet-500" style={{ width: `${truePct}%` }} title={`True: ${trues}`} />
          <div className="h-full bg-zinc-600" style={{ width: `${falsePct}%` }} title={`False: ${falses}`} />
        </div>
      </div>
    );
  }

  if (["number", "double", "int", "long", "decimal"].includes(primaryType)) {
    const nums = samples.map((v: any) => Number(v)).filter((n: any) => !isNaN(n));
    if (nums.length === 0) return renderTypeSegments();
    const min = Math.min(...nums), max = Math.max(...nums);
    const avg = nums.reduce((s: number, n: number) => s + n, 0) / nums.length;
    return (
      <div className="mt-3 space-y-2.5 border-t border-border/40 pt-2.5">
        {renderTypeSegments()}
        <div className="grid grid-cols-3 gap-2 p-2 rounded bg-muted/30 text-center font-mono text-[10px] border border-border/30">
          <div><p className="text-muted-foreground text-[8px] uppercase tracking-wider">Min</p><p className="font-semibold text-xs">{min.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground text-[8px] uppercase tracking-wider">Avg</p><p className="font-semibold text-primary text-xs">{avg.toFixed(2)}</p></div>
          <div><p className="text-muted-foreground text-[8px] uppercase tracking-wider">Max</p><p className="font-semibold text-xs">{max.toLocaleString()}</p></div>
        </div>
      </div>
    );
  }

  if (primaryType === "string") {
    const freq: Record<string, number> = {};
    let totalStrings = 0;
    samples.forEach((v: any) => { if (typeof v === "string") { freq[v] = (freq[v] || 0) + 1; totalStrings++; } });
    if (totalStrings === 0) return renderTypeSegments();
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return (
      <div className="mt-3 space-y-2 border-t border-border/40 pt-2.5">
        {renderTypeSegments()}
        <div className="space-y-2">
          {top.map(([val, count]) => {
            const pct = (count / totalStrings) * 100;
            return (
              <div key={val} className="space-y-0.5">
                <div className="flex justify-between text-[10px] font-mono leading-none">
                  <span className="text-emerald-400 truncate max-w-[70%]" title={val}>"{val}"</span>
                  <span className="text-muted-foreground shrink-0">{count} ({Math.round(pct)}%)</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (primaryType === "date") {
    const dates = samples.map((v: any) => { if (v instanceof Date) return v; const p = Date.parse(String(v)); return isNaN(p) ? null : new Date(p); }).filter((d: any): d is Date => d !== null);
    if (dates.length === 0) return renderTypeSegments();
    const oldest = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    const newest = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
    return (
      <div className="mt-3 space-y-2 border-t border-border/40 pt-2.5">
        {renderTypeSegments()}
        <div className="grid grid-cols-2 gap-2 p-2 rounded bg-muted/30 text-center font-mono text-[9px] border border-border/30">
          <div><p className="text-muted-foreground text-[8px] uppercase tracking-wider mb-0.5">Oldest Date</p><p className="font-semibold text-foreground truncate">{oldest.toLocaleDateString()}</p></div>
          <div><p className="text-muted-foreground text-[8px] uppercase tracking-wider mb-0.5">Newest Date</p><p className="font-semibold text-foreground truncate">{newest.toLocaleDateString()}</p></div>
        </div>
      </div>
    );
  }

  return renderTypeSegments();
}

// ─── Main Explorer component ──────────────────────────────────────────────────

export default function Explorer() {
  const params = useParams<{ connectionId?: string; database?: string; collection?: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const connectionId = params.connectionId || "";
  const database = params.database || "";
  const collection = params.collection || "";

  // ── All state from hook ──
  const s = useExplorerState(connectionId, database, collection);

  // ── Mobile nav tab mapping ──
  const [mobileNavTab, setMobileNavTab] = useState<MobileNavTab>("browse");
  const [mobileQueryModalOpen, setMobileQueryModalOpen] = useState(false);

  // Map mobile nav tabs to explorer tab values
  const handleMobileNavChange = useCallback((tab: MobileNavTab) => {
    setMobileNavTab(tab);
    switch (tab) {
      case "browse": s.setActiveTab("documents"); break;
      case "query": s.setActiveTab("query"); break;
      case "schema": s.setActiveTab("schema"); break;
      case "performance": s.setActiveTab("performance"); break;
    }
  }, [s]);

  // ── API data queries ──
  const { data: dbsData, isLoading: dbsLoading } = useListDatabases(connectionId, {
    query: { enabled: !!connectionId, queryKey: getListDatabasesQueryKey(connectionId) }
  });
  const { data: colsData, isLoading: colsLoading } = useListCollections(connectionId, database, {
    query: { enabled: !!connectionId && !!database, queryKey: getListCollectionsQueryKey(connectionId, database) }
  });

  // ── Documents list params (memoised) ──
  const parseFilter = useCallback((str: string) => {
    if (!str || str.trim() === "") return {};
    try { return JSON.parse(str); }
    catch (err: any) { throw new Error(`Invalid JSON: ${err.message}`); }
  }, []);

  const documentsListParams = useMemo(() => {
    const effFilterStr = s.docQueryLive ? s.filterStr : s.appliedFilterStr;
    const effSortStr = s.docQueryLive ? s.sortStr : s.appliedSortStr;
    const emptyFilter = !effFilterStr.trim() || effFilterStr.trim() === "{}";
    const emptySort = !effSortStr.trim() || effSortStr.trim() === "{}";

    if (s.docQueryMode !== "code" || s.docCodeFormat === "json") {
      return { page: s.page, limit: s.limit, filter: emptyFilter ? undefined : effFilterStr, sort: emptySort ? undefined : effSortStr, parseError: null as string | null };
    }
    try {
      return { page: s.page, limit: s.limit, filter: emptyFilter ? undefined : JSON.stringify(mongoshDocumentToObject(effFilterStr)), sort: emptySort ? undefined : JSON.stringify(mongoshDocumentToObject(effSortStr)), parseError: null as string | null };
    } catch (e) {
      return { page: s.page, limit: s.limit, filter: undefined, sort: undefined, parseError: e instanceof Error ? e.message : String(e) };
    }
  }, [s.docQueryMode, s.docCodeFormat, s.docQueryLive, s.filterStr, s.appliedFilterStr, s.sortStr, s.appliedSortStr, s.page, s.limit]);

  const shellQueryBlocked = documentsListParams.parseError !== null;

  const { data: docsData, isLoading: docsLoading, error: docsError } = useListDocuments(
    connectionId, database, collection,
    { page: documentsListParams.page, limit: documentsListParams.limit, filter: documentsListParams.filter, sort: documentsListParams.sort },
    { query: { enabled: !!connectionId && !!database && !!collection && !shellQueryBlocked, queryKey: getListDocumentsQueryKey(connectionId, database, collection, { page: documentsListParams.page, limit: documentsListParams.limit, filter: documentsListParams.filter, sort: documentsListParams.sort }) } }
  );
  const { data: schemaData, isLoading: schemaLoading, refetch: refetchSchema } = useAnalyzeSchema(connectionId, database, collection, {}, {
    query: { enabled: !!connectionId && !!database && !!collection && (s.activeTab === "schema" || s.activeTab === "query" || s.activeTab === "documents"), queryKey: getAnalyzeSchemaQueryKey(connectionId, database, collection, {}) }
  });
  const { data: indexData, isLoading: indexLoading } = useListIndexes(connectionId, database, collection, {
    query: { enabled: !!connectionId && !!database && !!collection && s.activeTab === "indexes", queryKey: getListIndexesQueryKey(connectionId, database, collection) }
  });
  const { data: savedQueriesData } = useListSavedQueries({ query: { queryKey: getListSavedQueriesQueryKey() } });

  // ── Mutation hooks for collections/databases ──
  const createCol = useCreateCollection();
  const dropCol = useDropCollection();
  const dropDb = useDropDatabase();

  // ── Action hooks ──
  const docActions = useDocumentActions({
    connectionId, database, collection,
    state: {
      insertJson: s.insertJson, setShowInsertModal: s.setShowInsertModal, setInsertJson: s.setInsertJson,
      editDocId: s.editDocId, editJson: s.editJson, setShowEditModal: s.setShowEditModal,
      bulkUpdateJson: s.bulkUpdateJson, setBulkUpdateJson: s.setBulkUpdateJson, setShowBulkUpdateModal: s.setShowBulkUpdateModal,
      selectedDocs: s.selectedDocs, setSelectedDocs: s.setSelectedDocs,
      docToDelete: s.docToDelete, setDocToDelete: s.setDocToDelete, setShowSingleDeleteConfirm: s.setShowSingleDeleteConfirm,
      docToDuplicate: s.docToDuplicate, setDocToDuplicate: s.setDocToDuplicate, setShowDuplicateConfirm: s.setShowDuplicateConfirm,
      setInlineEditCell: s.setInlineEditCell,
      filterStr: s.filterStr, docQueryLive: s.docQueryLive, setAppliedFilterStr: s.setAppliedFilterStr, setPage: s.setPage,
    }
  });

  const queryActions = useQueryActions({
    connectionId, database, collection, parseFilter,
    queryFilter: s.queryFilter, querySort: s.querySort, queryLimit: s.queryLimit,
    aggregatePipeline: s.aggregatePipeline, saveQueryName: s.saveQueryName,
    setQueryResults: s.setQueryResults, setQueryTime: s.setQueryTime,
    setExplainResult: s.setExplainResult, setShowSaveQueryModal: s.setShowSaveQueryModal,
    setSaveQueryName: s.setSaveQueryName, setChartData: s.setChartData, setShowHistory: s.setShowHistory,
  });

  const docs = shellQueryBlocked ? [] : ((docsData?.documents as Record<string, unknown>[]) || []);

  const sortedVisibleDocs = useMemo(() => {
    let filtered = docs;
    if (s.localSearch.trim()) {
      const q = s.localSearch.toLowerCase();
      filtered = docs.filter((doc) => Object.values(doc).some((v) => String(v ?? "").toLowerCase().includes(q)));
    }
    return [...filtered].sort((a, b) => {
      const aPin = s.pinnedDocs.has(String(a._id)) ? 0 : 1;
      const bPin = s.pinnedDocs.has(String(b._id)) ? 0 : 1;
      return aPin - bPin;
    });
  }, [docs, s.localSearch, s.pinnedDocs]);

  const importExport = useImportExport({
    connectionId, database, collection,
    selectedDocs: s.selectedDocs, appliedFilterStr: s.appliedFilterStr, filterStr: s.filterStr, docQueryLive: s.docQueryLive,
    importData: s.importData, importFormat: s.importFormat, importFileTooLarge: s.importFileTooLarge,
    exportFormat: s.exportFormat, exportRange: s.exportRange, exportLimit: s.exportLimit,
    sortedVisibleDocs, page: s.page,
    setImportData: s.setImportData, setImportFormat: s.setImportFormat, setImportFileName: s.setImportFileName,
    setImportFileSize: s.setImportFileSize, setImportFileTooLarge: s.setImportFileTooLarge,
    setImportCliCommand: s.setImportCliCommand, setShowImportModal: s.setShowImportModal, setShowExportModal: s.setShowExportModal,
  });

  const indexManager = useIndexManager({
    connectionId, database, collection,
    state: {
      indexBuildMode: s.indexBuildMode, indexKeysBuilder: s.indexKeysBuilder, setIndexKeysBuilder: s.setIndexKeysBuilder,
      newIndexKeys: s.newIndexKeys, setNewIndexKeys: s.setNewIndexKeys, newIndexName: s.newIndexName, setNewIndexName: s.setNewIndexName,
      newIndexUnique: s.newIndexUnique, setNewIndexUnique: s.setNewIndexUnique, newIndexSparse: s.newIndexSparse, setNewIndexSparse: s.setNewIndexSparse,
      newIndexTTL: s.newIndexTTL, setNewIndexTTL: s.setNewIndexTTL, newIndexTTLExpires: s.newIndexTTLExpires, setNewIndexTTLExpires: s.setNewIndexTTLExpires,
      newIndexAdvancedJSON: s.newIndexAdvancedJSON, setNewIndexAdvancedJSON: s.setNewIndexAdvancedJSON,
      showAdvancedIndex: s.showAdvancedIndex, setShowAdvancedIndex: s.setShowAdvancedIndex, setShowIndexModal: s.setShowIndexModal,
    }
  });

  // ── Computed field data ──
  const allFields = useMemo(() => {
    if ((schemaData?.fields?.length ?? 0) > 0) return Array.from(new Set(["_id", ...(schemaData?.fields ?? []).map((f: any) => f.path)]));
    if (docs.length > 0) return Array.from(new Set(docs.flatMap((d) => Object.keys(d)))).slice(0, 50);
    return ["_id"];
  }, [schemaData, docs]);

  const orderedFields = useMemo(() => {
    const order = s.customColOrders[`${database}.${collection}`] || [];
    const filtered = order.filter((f) => allFields.includes(f));
    const added = allFields.filter((f) => !filtered.includes(f));
    return [...filtered, ...added];
  }, [allFields, s.customColOrders, database, collection]);

  const fieldTypesMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (schemaData?.fields) schemaData.fields.forEach((f: any) => { if (f.path && f.types?.[0]?.type) map[f.path] = f.types[0].type; });
    return map;
  }, [schemaData]);

  const visibleJsonPayloadBytes = useMemo(() => new Blob([JSON.stringify(sortedVisibleDocs)]).size, [sortedVisibleDocs]);

  const typeColor: Record<string, string> = {
    string: "text-emerald-400", number: "text-amber-400", boolean: "text-violet-400",
    object: "text-blue-400", array: "text-orange-400", null: "text-rose-400",
    objectId: "text-cyan-400", date: "text-pink-400",
  };

  // ── Validation ──
  const fetchValidation = useCallback(async () => {
    if (!database || !collection) return;
    s.setLoadingValidation(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/databases/${database}/collections/${collection}/validation`);
      const data = await res.json();
      s.setValidationData(data);
      s.setValidationJson(JSON.stringify(data.validator || {}, null, 2));
    } catch { /* silently ignore */ }
    finally { s.setLoadingValidation(false); }
  }, [connectionId, database, collection]);

  const handleUpdateValidation = async () => {
    try {
      const validator = JSON.parse(s.validationJson);
      const res = await fetch(`/api/connections/${connectionId}/databases/${database}/collections/${collection}/validation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validator, validationLevel: s.validationData?.validationLevel || "strict", validationAction: s.validationData?.validationAction || "error" })
      });
      const data = await res.json();
      if (data.success) { toast({ title: TOAST.VALIDATION_UPDATED, description: TOAST_DESC.VALIDATION_UPDATED }); s.setIsEditingValidation(false); fetchValidation(); }
      else throw new Error(data.message);
    } catch (err) {
      toast({ title: TOAST.VALIDATION_UPDATE_FAILED, description: err instanceof Error ? err.message : "Invalid JSON", variant: "destructive" });
    }
  };

  useEffect(() => { if (s.activeTab === "schema") fetchValidation(); }, [s.activeTab, fetchValidation]);

  // ── Auto-refresh ──
  useEffect(() => {
    if (s.autoRefreshInterval <= 0 || !connectionId || !database || !collection) return;
    const timer = setInterval(() => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }), s.autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [s.autoRefreshInterval, connectionId, database, collection, queryClient]);

  // ── ⌘K focus search ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); document.querySelector<HTMLInputElement>("[data-doc-page-search]")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── applyDocumentQuery ──
  const applyDocumentQuery = useCallback(() => {
    s.setAppliedFilterStr(s.filterStr);
    s.setAppliedSortStr(s.sortStr);
    s.setPage(1);
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
  }, [s.filterStr, s.sortStr, connectionId, database, collection, queryClient]);

  // ── handleResetAll ──
  const handleResetAll = () => {
    s.setFilterStr("{}"); s.setSortStr("{}"); s.setAppliedFilterStr("{}"); s.setAppliedSortStr("{}");
    s.setLocalSearch(""); s.setHiddenColumns(new Set()); s.setPinnedDocs(new Set()); s.setPage(1);
    toast({ title: TOAST.FILTERS_RESET, description: TOAST_DESC.FILTERS_RESET });
  };

  // ── Field/column helpers ──
  const handleReorderFields = useCallback((fields: string[]) => {
    s.setCustomColOrders((prev) => ({ ...prev, [`${database}.${collection}`]: fields }));
  }, [database, collection]);

  const invertDocumentSelection = useCallback(() => {
    const allIds = new Set(sortedVisibleDocs.map((d) => String(d._id)));
    s.setSelectedDocs((prev) => { const next = new Set<string>(); allIds.forEach((id) => { if (!prev.has(id)) next.add(id); }); return next; });
    toast({ title: TOAST.SELECTION_INVERTED, description: TOAST_DESC.SELECTION_INVERTED });
  }, [sortedVisibleDocs, toast]);

  const copyDocIdToast = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: "_id copied", description: id.length > 56 ? `${id.slice(0, 28)}…` : id });
  }, [toast]);

  // ── Collection / DB handlers ──
  const handleCreateCollection = async () => {
    try {
      await createCol.mutateAsync({ connectionId, dbName: database, data: { name: s.newColName } });
      queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey(connectionId, database) });
      s.setShowCreateColModal(false); s.setNewColName("");
      toast({ title: TOAST.COLLECTION_CREATED });
    } catch (err: any) { toast({ title: TOAST.COLLECTION_CREATE_FAILED, description: err.message, variant: "destructive" }); }
  };

  const handleDropDatabase = async () => {
    try {
      await dropDb.mutateAsync({ connectionId, dbName: s.dbToDrop });
      queryClient.invalidateQueries({ queryKey: getListDatabasesQueryKey(connectionId) });
      s.setShowDropDbModal(false);
      if (database === s.dbToDrop) setLocation(`/explorer/${connectionId}`);
      toast({ title: TOAST.DATABASE_DROPPED(s.dbToDrop) });
    } catch (err: any) { toast({ title: TOAST.DATABASE_DROP_FAILED, description: err.message, variant: "destructive" }); }
  };

  const handleDropCollection = async () => {
    try {
      await dropCol.mutateAsync({ connectionId, dbName: s.colToDropDb, collectionName: s.colToDrop });
      queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey(connectionId, s.colToDropDb) });
      s.setShowDropColModal(false);
      if (database === s.colToDropDb && collection === s.colToDrop) setLocation(`/explorer/${connectionId}/${database}`);
      toast({ title: TOAST.COLLECTION_DROPPED(s.colToDrop) });
    } catch (err: any) { toast({ title: TOAST.COLLECTION_DROP_FAILED, description: err.message, variant: "destructive" }); }
  };

  // ── handleQuickFilter (needs filterStr setter from state) ──
  const handleQuickFilter = useCallback((field: string, value: unknown) => {
    let filter: any = {};
    try { filter = JSON.parse(s.filterStr || "{}"); } catch { filter = {}; }
    const nextFilter = { ...filter, [field]: value };
    const nextFilterStr = JSON.stringify(nextFilter, null, 2);
    s.setFilterStr(nextFilterStr);
    if (s.docQueryLive) { s.setPage(1); }
    else { s.setAppliedFilterStr(nextFilterStr); s.setPage(1); queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }); }
    toast({ title: TOAST.QUERY_FILTER_APPLIED, description: TOAST_DESC.QUICK_FILTER_APPLIED(field, String(value)) });
  }, [s, connectionId, database, collection, queryClient, toast]);

  // ── Shared sidebar props ──
  const sidebarProps = {
    connectionId, database, collection,
    expandedDbs: s.expandedDbs,
    onToggleDb: (dbName: string) => s.setExpandedDbs((prev) => { const next = new Set(prev); next.has(dbName) ? next.delete(dbName) : next.add(dbName); return next; }),
    onSelectDb: (dbName: string) => setLocation(`/explorer/${connectionId}/${dbName}`),
    onSelectCollection: (_db: string, col: string) => { s.setPage(1); setLocation(`/explorer/${connectionId}/${_db}/${col}`); },
    onDropDb: (dbName: string) => { s.setDbToDrop(dbName); s.setShowDropDbModal(true); },
    onDropCollection: (db: string, col: string) => { s.setColToDropDb(db); s.setColToDrop(col); s.setShowDropColModal(true); },
    onCreateCollection: () => s.setShowCreateColModal(true),
    databases: dbsData?.databases || [],
    collections: colsData?.collections || [],
    dbsLoading,
    colsLoading,
    savedQueries: savedQueriesData?.queries || [],
    onSelectSavedQuery: (q: any) => {
      const qdata = q.query as { filter?: any; sort?: any; limit?: number };
      s.setQueryFilter(JSON.stringify(qdata.filter || {}, null, 2));
      s.setQuerySort(JSON.stringify(qdata.sort || {}, null, 2));
      s.setQueryLimit(String(qdata.limit || 20));
      s.setActiveTab("query");
    },
    onDeleteSavedQuery: (id: string) => {
      queryActions.deleteSavedQuery.mutate({ queryId: id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedQueriesQueryKey() })
      });
    },
  };

  // ── Document view renderer ──
  const renderDocumentView = () => {
    const visibleFields = orderedFields.filter((f) => !s.hiddenColumns.has(f));
    const sortedDocs = sortedVisibleDocs;

    // On mobile, hide spreadsheet and default to card
    const effectiveViewMode = isMobile && s.viewMode === "spreadsheet" ? "card" : s.viewMode;

    switch (effectiveViewMode) {
      case "json":
        return (
          <DocumentsJsonView
            docs={sortedDocs as Record<string, unknown>[]}
            pinnedDocIds={s.pinnedDocs}
            onTogglePin={(id) => s.setPinnedDocs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            onCopy={docActions.handleCopyDoc}
            onDuplicate={docActions.handleDuplicateDoc}
            searchQuery={s.localSearch}
            onOpenDocument={(doc) => { const docId = String(doc._id ?? ""); const json = JSON.stringify(doc, null, 2); s.setFullDocumentJsonModal({ docId, draft: json, initialJson: json }); }}
            compareMode={s.compareMode}
            compareDocs={s.compareDocs}
            onToggleCompare={(docId, checked) => s.setCompareDocs((prev) => { if (!checked) return prev.filter((x) => x !== docId); if (prev.includes(docId) || prev.length >= 2) return prev; return [...prev, docId]; })}
            selectedDocs={s.selectedDocs}
            onToggleSelect={(docId, checked) => s.setSelectedDocs((prev) => { const n = new Set(prev); checked ? n.add(docId) : n.delete(docId); return n; })}
          />
        );
      case "card":
        return (
          <DocumentsCardView
            docs={sortedDocs}
            visibleFields={visibleFields}
            pinnedDocIds={s.pinnedDocs}
            onTogglePin={(id) => s.setPinnedDocs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            onCopy={docActions.handleCopyDoc}
            onDuplicate={docActions.handleDuplicateDoc}
            onQuickFilter={handleQuickFilter}
            onOpenDocument={(doc) => { const docId = String(doc._id ?? ""); const json = JSON.stringify(doc, null, 2); s.setFullDocumentJsonModal({ docId, draft: json, initialJson: json }); }}
            compareMode={s.compareMode}
            compareDocs={s.compareDocs}
            onToggleCompare={(docId, checked) => s.setCompareDocs((prev) => { if (!checked) return prev.filter((x) => x !== docId); if (prev.includes(docId) || prev.length >= 2) return prev; return [...prev, docId]; })}
            selectedDocs={s.selectedDocs}
            onToggleSelect={(docId, checked) => s.setSelectedDocs((prev) => { const n = new Set(prev); checked ? n.add(docId) : n.delete(docId); return n; })}
          />
        );
      default:
        return (
          <DocumentsSpreadsheetView
            docs={sortedDocs}
            visibleFields={visibleFields}
            layout={s.spreadsheetLayout}
            onLayoutChange={s.setSpreadsheetLayout}
            fieldTypes={fieldTypesMap}
            handlers={{
              onOpenFullDocument: (doc) => { const docId = String(doc._id ?? ""); const json = JSON.stringify(doc, null, 2); s.setFullDocumentJsonModal({ docId, draft: json, initialJson: json }); },
              onCopy: docActions.handleCopyDoc,
              onDuplicate: docActions.handleDuplicateDoc,
              onPin: (docId) => s.setPinnedDocs((prev) => { const n = new Set(prev); n.has(docId) ? n.delete(docId) : n.add(docId); return n; }),
              isPinned: (id) => s.pinnedDocs.has(id),
              onEdit: (docId, doc) => { s.setEditDocId(docId); const { _id, ...rest } = doc; s.setEditJson(JSON.stringify(rest, null, 2)); s.setShowEditModal(true); },
              onDelete: (docId) => { s.setDocToDelete(docId); s.setShowSingleDeleteConfirm(true); },
              compareMode: s.compareMode,
              compareDocs: s.compareDocs,
              onToggleCompare: (docId, checked) => s.setCompareDocs((prev) => { if (!checked) return prev.filter((x) => x !== docId); if (prev.includes(docId) || prev.length >= 2) return prev; return [...prev, docId]; }),
              selectedDocs: s.selectedDocs,
              onToggleSelect: (docId, checked) => s.setSelectedDocs((prev) => { const n = new Set(prev); checked ? n.add(docId) : n.delete(docId); return n; }),
              onSelectAll: (checked, ids) => s.setSelectedDocs(checked ? new Set(ids) : new Set()),
              inlineEditCell: s.inlineEditCell,
              onInlineEdit: docActions.handleInlineEdit,
              setInlineEditCell: s.setInlineEditCell,
              onReorderFields: handleReorderFields,
            }}
          />
        );
    }
  };

  // ── Schema mobile fallback ──
  const renderSchemaMobileView = () => (
    <div className="p-4 space-y-4">
      <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
        <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">{LABEL.MOBILE_SCHEMA_DESKTOP_ONLY}</p>
        <p className="text-xs text-muted-foreground mt-1">{LABEL.MOBILE_SCHEMA_OPEN_DESKTOP}</p>
      </div>
      {schemaData?.fields && (
        <div className="space-y-2">
          {schemaData.fields.map((field: any) => (
            <div key={field.path} className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-medium ${typeColor[field.type] || "text-foreground"}`}>{field.name}</span>
                <Badge variant="outline" className="text-xs">{field.types?.join(" | ") || field.type}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{Math.round((field.prevalence || 0) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`flex h-screen w-full bg-background text-foreground overflow-hidden ${isMobile ? "flex-col" : ""}`}>

      {/* Desktop sidebar */}
      <ExplorerSidebar {...sidebarProps} />

      {/* Mobile drawer */}
      <MobileSidebarDrawer
        open={s.mobileDrawerOpen}
        onClose={() => s.setMobileDrawerOpen(false)}
        {...sidebarProps}
      />

      {/* Main panel */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile header */}
        <MobileHeader
          database={database}
          collection={collection}
          onOpenDrawer={() => s.setMobileDrawerOpen(true)}
          onInsert={() => s.setShowInsertModal(true)}
          onExport={() => { s.setExportRange(s.selectedDocs.size > 0 ? "selected" : "query"); s.setShowExportModal(true); }}
          onImport={() => { s.setImportData(""); s.setImportFileName(""); s.setImportFileSize(0); s.setShowImportModal(true); }}
        />

        {/* Desktop header */}
        <ExplorerHeader
          database={database}
          collection={collection}
          connectionId={connectionId}
          totalDocs={docsData?.total}
          selectedDocsCount={s.selectedDocs.size}
          onExport={() => { s.setExportRange(s.selectedDocs.size > 0 ? "selected" : "query"); s.setShowExportModal(true); }}
          onImport={() => { s.setImportData(""); s.setImportFileName(""); s.setImportFileSize(0); s.setShowImportModal(true); }}
          onInsert={() => s.setShowInsertModal(true)}
        />

        {/* Desktop: state text when no collection */}
        {!collection && (
          <div className="hidden md:flex h-14 border-b border-border items-center px-4 gap-3 bg-card shrink-0">
            {database
              ? <span className="text-sm font-mono font-medium">{database} — {LABEL.SELECT_COLLECTION}</span>
              : connectionId
              ? <span className="text-sm text-muted-foreground">{LABEL.SELECT_DB_AND_COLLECTION}</span>
              : <span className="text-sm text-muted-foreground">{LABEL.SELECT_CONNECTION}</span>}
          </div>
        )}

        {/* Content area */}
        <div className={`flex-1 overflow-hidden ${isMobile ? "mobile-content-pb" : ""}`}>
          {!collection ? (
            database ? (
              <NoSqlSchemaBuilder connectionId={connectionId} database={database} />
            ) : connectionId ? (
              <ServerPerformanceDashboard connectionId={connectionId} />
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">{LABEL.SELECT_CONNECTION_START}</p>
                  <p className="text-sm mt-1">{LABEL.NAVIGATE_SIDEBAR}</p>
                </div>
              </div>
            )
          ) : (
            <Tabs value={s.activeTab} onValueChange={s.setActiveTab} className="flex-1 flex flex-col overflow-hidden h-full">
              <CollectionTabBar />

              {/* DASHBOARD */}
              <TabsContent value="dashboard" className="flex-1 overflow-auto m-0">
                <DashboardContent connectionId={connectionId} database={database} collection={collection} schemaData={schemaData} />
              </TabsContent>

              {/* DOCUMENTS */}
              <TabsContent value="documents" className="flex-1 flex flex-col overflow-hidden m-0">
                {/* Query header */}
                {isMobile ? (
                  <div className="px-3 py-2 border-b border-border bg-card shrink-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-1.5 bg-muted/40 rounded-full px-3 py-1 border border-border/60" title="Focus: ⌘K">
                        <Search className="w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          data-doc-page-search
                          type="text"
                          value={s.localSearch}
                          onChange={(e) => s.setLocalSearch(e.target.value)}
                          placeholder="Search in page..."
                          className="bg-transparent text-xs w-full outline-none placeholder:text-muted-foreground/50 py-0.5"
                        />
                        {s.localSearch && (
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => s.setLocalSearch("")}>
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <Button
                        variant={s.filterStr !== "{}" || s.sortStr !== "{}" ? "default" : "outline"}
                        size="sm"
                        className="h-8 rounded-full text-xs gap-1.5 px-3"
                        onClick={() => setMobileQueryModalOpen(true)}
                      >
                        <Filter className="w-3 h-3" />
                        <span>Filter</span>
                        {(s.filterStr !== "{}" || s.sortStr !== "{}") && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </Button>
                    </div>

                    {/* Horizontal scrollable quick settings/stats for mobile */}
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-invisible py-0.5 text-[10px] text-muted-foreground">
                      <span className="shrink-0 bg-muted/30 px-2 py-0.5 rounded border border-border/40 font-mono">
                        {sortedVisibleDocs.length} shown
                      </span>
                      <button
                        className={`shrink-0 px-2 py-0.5 rounded border border-border/40 font-mono transition-colors ${s.viewMode === "json" ? "bg-primary/10 text-primary border-primary/20" : ""}`}
                        onClick={() => s.setViewMode("json")}
                      >
                        JSON View
                      </button>
                      <button
                        className={`shrink-0 px-2 py-0.5 rounded border border-border/40 font-mono transition-colors ${s.viewMode === "card" ? "bg-primary/10 text-primary border-primary/20" : ""}`}
                        onClick={() => s.setViewMode("card")}
                      >
                        Card View
                      </button>
                      <button
                        className="shrink-0 px-2 py-0.5 rounded border border-border/40 font-mono text-rose-500 hover:bg-rose-500/5 transition-colors"
                        onClick={handleResetAll}
                      >
                        Reset All
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-2 border-b border-border bg-card shrink-0 space-y-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                        <button type="button" className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${s.docQueryMode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setDocQueryMode("visual")}>
                          <MousePointerClick className="w-2.5 h-2.5" /> {LABEL.QUERY_VISUAL}
                        </button>
                        <button type="button" className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${s.docQueryMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setDocQueryMode("code")}>
                          <Code className="w-2.5 h-2.5" /> {LABEL.QUERY_CODE}
                        </button>
                      </div>
                      <div className="flex items-center rounded-md border border-border/50 overflow-hidden" title="When off, the grid updates only after Apply.">
                        <button type="button" className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${s.docQueryLive ? "bg-emerald-600/90 text-white" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setDocQueryLive(true)}>
                          <Zap className="w-2.5 h-2.5" /> {LABEL.QUERY_LIVE}
                        </button>
                        <button type="button" className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${!s.docQueryLive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => { s.setAppliedFilterStr(s.filterStr); s.setAppliedSortStr(s.sortStr); s.setDocQueryLive(false); }}>
                          <Play className="w-2.5 h-2.5" /> {LABEL.QUERY_APPLY_MODE}
                        </button>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground" onClick={() => s.setDocQueryVisible(!s.docQueryVisible)}>
                        {s.docQueryVisible ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        {s.docQueryVisible ? LABEL.COLLAPSE : LABEL.EXPAND}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground" onClick={handleResetAll}>
                        <RefreshCw className="w-2.5 h-2.5" /> {LABEL.RESET_ALL}
                      </Button>
                      <div className="flex-1" />
                      {s.selectedDocs.size > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-violet-500/30 text-violet-400 bg-violet-500/10" onClick={() => { s.setBulkUpdateJson(`{\n  "$set": {\n    \n  }\n}`); s.setShowBulkUpdateModal(true); }}>
                            <RefreshCw className="w-2.5 h-2.5" /> Update {s.selectedDocs.size}
                          </Button>
                          <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1" onClick={docActions.handleBulkDelete}>
                            <Trash2 className="w-2.5 h-2.5" /> Delete {s.selectedDocs.size}
                          </Button>
                        </div>
                      )}
                    </div>

                    {s.docQueryVisible && s.docQueryMode === "visual" && (
                      <VisualQueryBuilder
                        filterValue={s.filterStr} sortValue={s.sortStr}
                        onFilterChange={(val) => s.setFilterStr(val || "{}")} onSortChange={(val) => s.setSortStr(val || "{}")}
                        fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                        liveQuery={s.docQueryLive}
                        onExecute={(payload) => { s.setPage(1); if (payload) { s.setAppliedFilterStr(payload.filter); s.setAppliedSortStr(payload.sort); } queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }); }}
                        isExecuting={docsLoading} compact
                      />
                    )}

                    {s.docQueryVisible && s.docQueryMode === "code" && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">Format</span>
                          <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                            <button type="button" className={`px-2 py-1 text-[10px] font-medium transition-colors ${s.docCodeFormat === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setDocCodeFormat("json")}>Strict JSON</button>
                            <button type="button" className={`px-2 py-1 text-[10px] font-medium transition-colors ${s.docCodeFormat === "mongosh" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setDocCodeFormat("mongosh")} title="mongosh / CLI style">mongosh (CLI)</button>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1 text-muted-foreground" onClick={() => s.setDocCodeEditorsExpanded((e) => !e)}>
                            <ChevronsDownUp className="w-3 h-3" />
                            {s.docCodeEditorsExpanded ? LABEL.COMPACT : LABEL.EXPAND}
                          </Button>
                        </div>
                        {shellQueryBlocked && documentsListParams.parseError && (
                          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="font-mono leading-snug">{documentsListParams.parseError}</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <QueryEditor
                            value={s.filterStr === "{}" ? "" : s.filterStr}
                            onChange={(val) => s.setFilterStr(val || "{}")}
                            placeholder={s.docCodeFormat === "mongosh" ? '{ status: "active" }' : 'Filter: { "field": "value" }'}
                            fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                            height={s.docCodeEditorsExpanded ? (s.docCodeFormat === "mongosh" ? "260px" : "220px") : (s.docCodeFormat === "mongosh" ? "100px" : "88px")}
                            className="flex-1 min-w-0 w-full" mode="filter"
                            syntax={s.docCodeFormat === "mongosh" ? "mongosh" : "json"}
                            onExecute={s.docQueryLive ? () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }) : applyDocumentQuery}
                          />
                          <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-end">
                            <QueryEditor
                              value={s.sortStr === "{}" ? "" : s.sortStr}
                              onChange={(val) => s.setSortStr(val || "{}")}
                              placeholder={s.docCodeFormat === "mongosh" ? "{ createdAt: -1 }" : 'Sort: { "field": -1 }'}
                              fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                              height={s.docCodeEditorsExpanded ? (s.docCodeFormat === "mongosh" ? "120px" : "100px") : (s.docCodeFormat === "mongosh" ? "72px" : "64px")}
                              className="flex-1 min-w-0 w-full min-[520px]:max-w-xs" mode="sort"
                              syntax={s.docCodeFormat === "mongosh" ? "mongosh" : "json"}
                              onExecute={s.docQueryLive ? () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }) : applyDocumentQuery}
                            />
                            {!s.docQueryLive && (
                              <Button size="sm" variant="default" className="h-8 text-[10px] gap-1 shrink-0" type="button" onClick={applyDocumentQuery}>
                                <Play className="w-2.5 h-2.5" /> {LABEL.APPLY_QUERY}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Feature toolbar (desktop only) */}
                {!isMobile && (
                  <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/50 bg-muted/20 shrink-0 flex-wrap">
                    <div className="flex items-center rounded-md border border-border/40 overflow-hidden">
                      <button className={`px-1.5 py-0.5 transition-colors ${s.viewMode === "json" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setViewMode("json")} title={LABEL.VIEW_JSON}><FileJson className="w-3 h-3" /></button>
                      <button className={`px-1.5 py-0.5 transition-colors ${s.viewMode === "card" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setViewMode("card")} title={LABEL.VIEW_CARD}><LayoutGrid className="w-3 h-3" /></button>
                      {!isMobile && (
                        <button className={`px-1.5 py-0.5 transition-colors ${s.viewMode === "spreadsheet" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} onClick={() => s.setViewMode("spreadsheet")} title={LABEL.VIEW_SPREADSHEET}><Grid3x3 className="w-3 h-3" /></button>
                      )}
                    </div>
                    <div className="relative">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => s.setShowColumnManager(!s.showColumnManager)}>
                        <Columns className="w-2.5 h-2.5" /> {LABEL.COLUMNS}
                      </Button>
                      {s.showColumnManager && (
                        <div className="absolute top-7 left-0 z-50 bg-card border border-border rounded-md shadow-lg p-2 w-48 max-h-64 overflow-auto">
                          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider mb-1">{LABEL.SHOW_HIDE_COLUMNS}</p>
                          {allFields.map((f) => (
                            <label key={f} className="flex items-center gap-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-muted/30 px-1 rounded">
                              <input type="checkbox" className="rounded w-3 h-3" checked={!s.hiddenColumns.has(f)} onChange={(e) => s.setHiddenColumns((prev) => { const next = new Set(prev); e.target.checked ? next.delete(f) : next.add(f); return next; })} />
                              <span className="font-mono truncate">{f}</span>
                            </label>
                          ))}
                          {s.hiddenColumns.size > 0 && <Button variant="ghost" size="sm" className="w-full h-5 text-[9px] mt-1" onClick={() => s.setHiddenColumns(new Set())}>{LABEL.SHOW_ALL}</Button>}
                        </div>
                      )}
                    </div>
                    <Button variant={s.compareMode ? "default" : "ghost"} size="sm" className="h-6 text-[10px] gap-1" onClick={() => { s.setCompareMode(!s.compareMode); s.setCompareDocs([]); }}>
                      <Diff className="w-2.5 h-2.5" /> {LABEL.COMPARE}
                      {s.compareMode && s.compareDocs.length > 0 && <span className="ml-0.5">({s.compareDocs.length}/2)</span>}
                    </Button>
                    {docs.length > 0 && (
                      <>
                        <Badge variant="secondary" className="h-6 px-2 text-[10px] font-normal tabular-nums">{sortedVisibleDocs.length} shown</Badge>
                        <Badge variant="outline" className="h-6 px-2 text-[10px] font-normal text-muted-foreground tabular-nums hidden sm:inline-flex">{formatPayloadSize(visibleJsonPayloadBytes)}</Badge>
                      </>
                    )}
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" title="Download visible documents as JSON" onClick={importExport.exportVisibleDocumentsJson} disabled={sortedVisibleDocs.length === 0}>
                      <Download className="w-2.5 h-2.5" /> {LABEL.EXPORT}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" title="Copy all visible _id values" onClick={importExport.copyVisibleDocumentIds} disabled={sortedVisibleDocs.length === 0}>
                      <ListTree className="w-2.5 h-2.5" /> {LABEL.COPY_IDS}
                    </Button>
                    {s.viewMode === "spreadsheet" && !s.compareMode && sortedVisibleDocs.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" title="Invert bulk selection on this page" onClick={invertDocumentSelection}>{LABEL.INVERT_SEL}</Button>
                    )}
                    <div className="w-px h-4 bg-border/30" />
                    <div className="flex items-center gap-1 bg-muted/30 rounded px-1.5 border border-border/30" title="Focus: ⌘K">
                      <Search className="w-2.5 h-2.5 text-muted-foreground" />
                      <input data-doc-page-search type="text" value={s.localSearch} onChange={(e) => s.setLocalSearch(e.target.value)} placeholder={LABEL.SEARCH_PLACEHOLDER} className="bg-transparent text-[10px] w-24 md:w-28 outline-none placeholder:text-muted-foreground/50 py-0.5" />
                      {s.localSearch && <button className="text-muted-foreground hover:text-foreground" onClick={() => s.setLocalSearch("")}><XCircle className="w-2.5 h-2.5" /></button>}
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <Timer className="w-2.5 h-2.5 text-muted-foreground" />
                      <select value={s.autoRefreshInterval} onChange={(e) => s.setAutoRefreshInterval(Number(e.target.value))} className="bg-transparent text-[10px] text-muted-foreground border-none outline-none cursor-pointer">
                        <option value={0}>Off</option>
                        <option value={5}>5s</option>
                        <option value={10}>10s</option>
                        <option value={30}>30s</option>
                        <option value={60}>60s</option>
                      </select>
                      {s.autoRefreshInterval > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </div>
                  </div>
                )}

                {/* Compare diff view */}
                {s.compareMode && s.compareDocs.length === 2 && (() => {
                  const docA = docs.find((d) => String(d._id) === s.compareDocs[0]);
                  const docB = docs.find((d) => String(d._id) === s.compareDocs[1]);
                  if (!docA || !docB) return null;
                  const allKeys = Array.from(new Set([...Object.keys(docA), ...Object.keys(docB)]));
                  return (
                    <div className="border-b border-border bg-muted/10 shrink-0">
                      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/30">
                        <Diff className="w-3 h-3 text-violet-400" />
                        <span className="text-[10px] font-medium text-violet-400">Comparing 2 documents</span>
                        <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={() => { s.setCompareDocs([]); s.setCompareMode(false); }}><X className="w-2.5 h-2.5" /> {LABEL.CLOSE}</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-0 max-h-[min(50vh,28rem)] overflow-auto">
                        {allKeys.map((key) => {
                          const vA = JSON.stringify(docA[key] ?? null), vB = JSON.stringify(docB[key] ?? null), isDiff = vA !== vB;
                          return (
                            <div key={key} className="contents">
                              <div className={`px-4 py-0.5 text-[10px] font-mono border-b border-r border-border/20 ${isDiff ? "bg-red-500/5" : ""}`}><span className="text-muted-foreground mr-1">{key}:</span><span className={isDiff ? "text-red-400" : ""}>{String(docA[key] ?? "—").slice(0, 60)}</span></div>
                              <div className={`px-4 py-0.5 text-[10px] font-mono border-b border-border/20 ${isDiff ? "bg-green-500/5" : ""}`}><span className="text-muted-foreground mr-1">{key}:</span><span className={isDiff ? "text-green-400" : ""}>{String(docB[key] ?? "—").slice(0, 60)}</span></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Document content */}
                <div ref={s.documentsContentRef} onScroll={s.handleDocContentScroll} className="flex-1 overflow-auto relative" onClick={() => { if (s.showColumnManager) s.setShowColumnManager(false); }}>
                  {docsError && (
                    <div className="p-4 flex items-center gap-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Failed to load documents: {(docsError as any).message || String(docsError)}</span>
                      <Button variant="outline" size="sm" className="h-7 text-xs ml-auto border-destructive/30 hover:bg-destructive/10" onClick={() => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) })}>Retry</Button>
                    </div>
                  )}
                  {docsLoading ? (
                    <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : docs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground"><div className="text-center"><FileJson className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No documents found</p></div></div>
                  ) : renderDocumentView()}
                  {s.docScrollShowTop && docs.length > 0 && (
                    <Button type="button" size="icon" variant="secondary" className="fixed bottom-20 right-6 z-40 h-9 w-9 rounded-full shadow-lg border border-border/60" onClick={s.scrollDocumentsToTop} title="Back to top"><ArrowUpToLine className="w-4 h-4" /></Button>
                  )}
                </div>

                {/* Pagination */}
                {docsData && docsData.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatPageRange(s.page, s.limit, docsData.total)}</span>
                      {docsData.executionTimeMs !== undefined && <Badge variant="outline" className="text-xs">{docsData.executionTimeMs}ms</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={String(s.limit)} onValueChange={(v) => { s.setLimit(Number(v)); s.setPage(1); }}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10, 20, 50, 100, 200, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={s.page <= 1} onClick={() => s.setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-xs">{s.page} / {docsData.totalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={s.page >= docsData.totalPages} onClick={() => s.setPage((p) => p + 1)}><ChevronRightIcon className="w-4 h-4" /></Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* SCHEMA */}
              <TabsContent value="schema" className="flex-1 overflow-auto m-0">
                {isMobile ? renderSchemaMobileView() : (
                  <div className="p-4">
                    {schemaLoading ? <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    : schemaData ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Sample: <strong className="text-foreground">{schemaData.sampleSize}</strong> docs</span>
                            <span>Total: <strong className="text-foreground">{schemaData.documentCount?.toLocaleString()}</strong></span>
                            <span>Fields: <strong className="text-foreground">{schemaData.fields?.length}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => refetchSchema()}><RefreshCw className="w-4 h-4" /></Button>
                            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => s.setIsEditingValidation(true)}><Shield className="w-3.5 h-3.5 text-primary" />{LABEL.MANAGE_VALIDATION}</Button>
                          </div>
                        </div>
                        {schemaData.inconsistencies?.length > 0 && (
                          <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/10">
                            <p className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{LABEL.SCHEMA_INCONSISTENCIES}</p>
                            {schemaData.inconsistencies.map((inc: any, i: number) => <div key={i} className="text-xs text-amber-300/80 font-mono">{inc.field}: {inc.issue}</div>)}
                          </div>
                        )}
                        <div className="space-y-2">
                          {schemaData.fields?.map((field: any) => (
                            <div key={field.path} className="border border-border rounded-lg p-3 hover:border-border/80">
                              <div className="flex items-center gap-3">
                                <span className={`text-sm font-mono font-medium ${typeColor[field.type] || "text-foreground"}`}>{field.name}</span>
                                <Badge variant="outline" className="text-xs">{field.types?.join(" | ") || field.type}</Badge>
                                {field.isArray && <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-400">array</Badge>}
                                {field.nullable && <Badge variant="outline" className="text-xs border-rose-500/40 text-rose-400">nullable</Badge>}
                                <div className="ml-auto flex items-center gap-2">
                                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(field.prevalence || 0) * 100}%` }} /></div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">{Math.round((field.prevalence || 0) * 100)}%</span>
                                </div>
                              </div>
                              <SchemaFieldVisualizer field={field} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <div className="flex items-center justify-center h-full text-muted-foreground"><p>{LABEL.CLICK_SCHEMA_ANALYZE}</p></div>}
                  </div>
                )}
              </TabsContent>

              {/* AGGREGATIONS */}
              <TabsContent value="query" className="flex-1 flex overflow-hidden m-0">
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <QueryTemplates onSelectFilter={(t) => s.setQueryFilter(t)} onSelectAggregate={(t) => s.setAggregatePipeline(t)} />
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => s.setShowHistory(!s.showHistory)}><Clock className="w-3.5 h-3.5" />History</Button>
                  </div>
                  <AggregationPipelineBuilder value={s.aggregatePipeline} onChange={(v) => s.setAggregatePipeline(v)} fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []} onExecute={queryActions.handleRunAggregate} onPreviewStage={queryActions.handlePreviewStage} collectionName={collection} />
                  <div className="flex items-center gap-3">
                    <Button size="sm" className="gap-1.5 h-8" onClick={queryActions.handleRunAggregate} disabled={queryActions.executeAggregate.isPending}>{queryActions.executeAggregate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Run Aggregate</Button>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={queryActions.handleExplain} disabled={queryActions.explainQuery.isPending}><Eye className="w-3.5 h-3.5" />Explain</Button>
                  </div>
                  {s.queryTime !== null && <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{s.queryTime}ms</Badge><span className="text-xs text-muted-foreground">{s.queryResults?.length || 0} results</span></div>}
                  {s.queryResults && s.queryResults.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="divide-y divide-border max-h-[50vh] overflow-auto">
                        {s.queryResults.map((doc, i) => <div key={i} className="px-4 py-2 font-mono text-xs hover:bg-muted/20"><JsonTree data={doc} /></div>)}
                      </div>
                    </div>
                  )}
                  {s.explainResult && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-medium">Execution Plan</h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div className={`p-3 rounded-lg border ${(s.explainResult.collectionScans as number) > 0 ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                          <p className="text-xs text-muted-foreground">Scan Type</p>
                          <p className={`text-sm font-medium ${(s.explainResult.collectionScans as number) > 0 ? "text-red-400" : "text-green-400"}`}>{(s.explainResult.collectionScans as number) > 0 ? "COLLSCAN" : "IXSCAN"}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-border"><p className="text-xs text-muted-foreground">Docs Examined</p><p className="text-sm font-medium">{String(s.explainResult.totalDocsExamined || 0)}</p></div>
                        <div className="p-3 rounded-lg border border-border"><p className="text-xs text-muted-foreground">Keys Examined</p><p className="text-sm font-medium">{String(s.explainResult.totalKeysExamined || 0)}</p></div>
                      </div>
                    </div>
                  )}
                </div>
                {s.showHistory && (
                  <div className="w-72 shrink-0">
                    <QueryHistory database={database} collection={collection}
                      onSelect={(entry) => { if (entry.type === "find") s.setQueryFilter(entry.query); else s.setAggregatePipeline(entry.query); s.setShowHistory(false); }}
                      onClose={() => s.setShowHistory(false)}
                    />
                  </div>
                )}
              </TabsContent>

              {/* INDEXES */}
              <TabsContent value="indexes" className="flex-1 overflow-auto m-0 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">{LABEL.INDEXES}</h3>
                  <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => s.setShowIndexModal(true)}><Plus className="w-3.5 h-3.5" />{LABEL.CREATE_INDEX}</Button>
                </div>
                {indexLoading ? <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
                  <div className="space-y-2">
                    {indexData?.indexes?.map((idx: any) => (
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
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => indexManager.handleDropIndex(idx.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                      </div>
                    ))}
                    {!indexData?.indexes?.length && <div className="text-center py-8 text-muted-foreground text-sm">{LABEL.NO_INDEXES_FOUND}</div>}
                  </div>
                )}
              </TabsContent>

              {/* PERFORMANCE */}
              <TabsContent value="performance" className="flex-1 overflow-auto m-0 p-4">
                <div className="space-y-4">
                  <div className="border border-border rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />{LABEL.QUERY_EXPLAIN}</h3>
                    <div className="space-y-2 mb-3">
                      <label className="text-xs text-muted-foreground">{LABEL.FILTER_FROM_QUERY}</label>
                      <Input value={s.queryFilter} onChange={(e) => s.setQueryFilter(e.target.value)} className="font-mono text-xs h-8" placeholder='{ "field": "value" }' />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={queryActions.handleExplain} disabled={queryActions.explainQuery.isPending}>{queryActions.explainQuery.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}{LABEL.EXPLAIN_QUERY}</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={queryActions.handleSuggestIndexes} disabled={queryActions.suggestIndexes.isPending}><Search className="w-3.5 h-3.5" />{LABEL.SUGGEST_INDEXES}</Button>
                    </div>
                  </div>
                  {s.explainResult && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-medium">Execution Stats</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`p-3 rounded-lg border ${(s.explainResult.collectionScans as number) > 0 ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                          {(s.explainResult.collectionScans as number) > 0 ? <div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /><div><p className="text-xs text-muted-foreground">Collection Scan</p><p className="text-sm font-medium text-red-400">No index used</p></div></div>
                          : <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><div><p className="text-xs text-muted-foreground">Index Scan</p><p className="text-sm font-medium text-green-400">Index used</p></div></div>}
                        </div>
                        <div className="p-3 rounded-lg border border-border"><p className="text-xs text-muted-foreground">Execution Time</p><p className="text-lg font-mono font-bold">{String(s.explainResult.executionTimeMs || 0)}ms</p></div>
                        <div className="p-3 rounded-lg border border-border"><p className="text-xs text-muted-foreground">Documents Examined</p><p className="text-lg font-mono font-bold">{String(s.explainResult.totalDocsExamined || 0)}</p></div>
                        <div className="p-3 rounded-lg border border-border"><p className="text-xs text-muted-foreground">Index Keys Examined</p><p className="text-lg font-mono font-bold">{String(s.explainResult.totalKeysExamined || 0)}</p></div>
                      </div>
                    </div>
                  )}
                  {queryActions.suggestIndexes.data && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-medium">Index Suggestions</h4>
                      {queryActions.suggestIndexes.data.suggestions?.map((suggestion: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1"><Search className="w-3.5 h-3.5 text-primary" /><span className="text-sm font-medium">{suggestion.fields.join(", ")}</span><Badge variant="outline" className="text-xs">{suggestion.estimatedImpact.split("—")[0].trim()}</Badge></div>
                          <p className="text-xs text-muted-foreground mb-2">{suggestion.reason}</p>
                          <code className="text-xs font-mono text-primary/80 bg-muted px-2 py-1 rounded block">{suggestion.createCommand}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* CHARTS */}
              <TabsContent value="charts" className="flex-1 flex flex-col overflow-hidden m-0 p-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Select value={s.chartType} onValueChange={s.setChartType}>
                      <SelectTrigger className="h-8 text-xs w-28" data-testid="select-chart-type"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="bar">Bar Chart</SelectItem><SelectItem value="line">Line Chart</SelectItem><SelectItem value="pie">Pie Chart</SelectItem></SelectContent>
                    </Select>
                    <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">X Axis</label><Input value={s.chartXField} onChange={(e) => s.setChartXField(e.target.value)} placeholder="field name" className="h-8 text-xs w-32 font-mono" data-testid="input-chart-x" /></div>
                    <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Y Axis</label><Input value={s.chartYField} onChange={(e) => s.setChartYField(e.target.value)} placeholder="field name" className="h-8 text-xs w-32 font-mono" data-testid="input-chart-y" /></div>
                    <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={queryActions.handleRunChart}><Play className="w-3.5 h-3.5" />{LABEL.LOAD_DATA}</Button>
                  </div>
                  {s.chartData && s.chartXField && s.chartYField ? (
                    <div className="border border-border rounded-lg p-4 h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        {s.chartType === "pie" ? (
                          <PieChart><Pie data={s.chartData.slice(0, 20)} dataKey={s.chartYField} nameKey={s.chartXField} cx="50%" cy="50%" outerRadius={100} label>{s.chartData.slice(0, 20).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><RechartsTooltip /><Legend /></PieChart>
                        ) : s.chartType === "line" ? (
                          <LineChart data={s.chartData.slice(0, 50)}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey={s.chartXField} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><RechartsTooltip /><Line type="monotone" dataKey={s.chartYField} stroke="#10b981" strokeWidth={2} dot={false} /></LineChart>
                        ) : (
                          <BarChart data={s.chartData.slice(0, 30)}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey={s.chartXField} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><RechartsTooltip /><Bar dataKey={s.chartYField} fill="#10b981" radius={[3, 3, 0, 0]} /></BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg h-72 flex items-center justify-center text-muted-foreground"><div className="text-center"><BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>{LABEL.SET_FIELDS_LOAD}</p></div></div>
                  )}
                  {s.chartData && <div className="text-xs text-muted-foreground">Showing {Math.min(s.chartData.length, 50)} of {s.chartData.length} documents</div>}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Mobile bottom nav (only when in collection view) */}
      {collection && (
        <MobileBottomNav
          activeTab={mobileNavTab}
          onTabChange={handleMobileNavChange}
        />
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}

      {/* Mobile Query & Filter Dialog */}
      <Dialog open={mobileQueryModalOpen} onOpenChange={setMobileQueryModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Query & Filters</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            {/* Mode selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Query Mode</span>
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden w-full bg-muted/40">
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${s.docQueryMode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => s.setDocQueryMode("visual")}
                >
                  <MousePointerClick className="w-3.5 h-3.5" /> {LABEL.QUERY_VISUAL}
                </button>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${s.docQueryMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => s.setDocQueryMode("code")}
                >
                  <Code className="w-3.5 h-3.5" /> {LABEL.QUERY_CODE}
                </button>
              </div>
            </div>

            {/* Live Query Switcher */}
            <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/15">
              <div>
                <p className="font-semibold text-xs">Live Querying</p>
                <p className="text-[9px] text-muted-foreground">Auto-updates as you type</p>
              </div>
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${s.docQueryLive ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => s.setDocQueryLive(true)}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${!s.docQueryLive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => s.setDocQueryLive(false)}
                >
                  Off
                </button>
              </div>
            </div>

            {/* Visual Builder or Code Editor */}
            {s.docQueryMode === "visual" ? (
              <VisualQueryBuilder
                filterValue={s.filterStr}
                sortValue={s.sortStr}
                onFilterChange={(val) => s.setFilterStr(val || "{}")}
                onSortChange={(val) => s.setSortStr(val || "{}")}
                fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                liveQuery={s.docQueryLive}
                onExecute={(payload) => {
                  s.setPage(1);
                  if (payload) {
                    s.setAppliedFilterStr(payload.filter);
                    s.setAppliedSortStr(payload.sort);
                  }
                  if (s.docQueryLive) {
                    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
                  }
                }}
                isExecuting={docsLoading}
                compact
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Format</span>
                  <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${s.docCodeFormat === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => s.setDocCodeFormat("json")}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${s.docCodeFormat === "mongosh" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => s.setDocCodeFormat("mongosh")}
                    >
                      mongosh
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-semibold">Filter Specification</label>
                  <QueryEditor
                    value={s.filterStr === "{}" ? "" : s.filterStr}
                    onChange={(val) => s.setFilterStr(val || "{}")}
                    placeholder={s.docCodeFormat === "mongosh" ? '{ status: "active" }' : 'Filter: { "field": "value" }'}
                    fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                    height="100px"
                    className="w-full"
                    mode="filter"
                    syntax={s.docCodeFormat === "mongosh" ? "mongosh" : "json"}
                    onExecute={s.docQueryLive ? () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }) : applyDocumentQuery}
                  />

                  <label className="text-[10px] text-muted-foreground uppercase font-semibold">Sort Specification</label>
                  <QueryEditor
                    value={s.sortStr === "{}" ? "" : s.sortStr}
                    onChange={(val) => s.setSortStr(val || "{}")}
                    placeholder={s.docCodeFormat === "mongosh" ? "{ createdAt: -1 }" : 'Sort: { "field": -1 }'}
                    fields={schemaData?.fields?.map((f: any) => ({ path: f.path, type: f.types?.[0]?.type })) || []}
                    height="80px"
                    className="w-full"
                    mode="sort"
                    syntax={s.docCodeFormat === "mongosh" ? "mongosh" : "json"}
                    onExecute={s.docQueryLive ? () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }) : applyDocumentQuery}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4 flex flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9 rounded-lg"
              onClick={() => {
                s.setFilterStr("{}");
                s.setSortStr("{}");
                s.setAppliedFilterStr("{}");
                s.setAppliedSortStr("{}");
                s.setPage(1);
                if (s.docQueryLive) {
                  queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
                }
                setMobileQueryModalOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              className="flex-1 h-9 rounded-lg"
              onClick={() => {
                applyDocumentQuery();
                setMobileQueryModalOpen(false);
              }}
            >
              Apply Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insert */}
      <Dialog open={s.showInsertModal} onOpenChange={s.setShowInsertModal}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{MODAL_TITLE.INSERT_DOCUMENT}</DialogTitle></DialogHeader>
          <MonacoJsonEditor value={s.insertJson} onChange={(val) => s.setInsertJson(val || "")} height="260px" onSave={docActions.handleInsert} />
          <DialogFooter><Button variant="outline" onClick={() => s.setShowInsertModal(false)}>{LABEL.CANCEL}</Button><Button onClick={docActions.handleInsert} disabled={docActions.insertDoc.isPending} data-testid="button-insert-confirm">{docActions.insertDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.INSERT}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={s.showEditModal} onOpenChange={s.setShowEditModal}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{MODAL_TITLE.EDIT_DOCUMENT}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground font-mono">_id: {s.editDocId}</p>
          <MonacoJsonEditor value={s.editJson} onChange={(val) => s.setEditJson(val || "")} height="260px" onSave={docActions.handleEditSave} />
          <DialogFooter><Button variant="outline" onClick={() => s.setShowEditModal(false)}>{LABEL.CANCEL}</Button><Button onClick={docActions.handleEditSave} disabled={docActions.updateDoc.isPending}>{docActions.updateDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.SAVE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full doc JSON modal */}
      <DocumentJsonModal
        open={!!s.fullDocumentJsonModal}
        onOpenChange={(open) => { if (!open) s.setFullDocumentJsonModal(null); }}
        docId={s.fullDocumentJsonModal?.docId ?? ""}
        draft={s.fullDocumentJsonModal?.draft ?? ""}
        onDraftChange={(next) => s.setFullDocumentJsonModal((prev) => prev ? { ...prev, draft: next } : prev)}
        initialJson={s.fullDocumentJsonModal?.initialJson ?? ""}
        onSave={() => void docActions.handleFullDocumentJsonModalSave(s.fullDocumentJsonModal!, () => s.setFullDocumentJsonModal(null))}
        isSaving={docActions.updateDoc.isPending}
      />

      {/* Bulk Update */}
      <Dialog open={s.showBulkUpdateModal} onOpenChange={s.setShowBulkUpdateModal}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{MODAL_TITLE.BULK_UPDATE_DOCUMENTS}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{CONFIRM_MSG.BULK_UPDATE_INFO(s.selectedDocs.size)}</p>
            <p className="text-[10px] text-amber-500 bg-amber-500/5 border border-amber-500/10 px-2 py-1 rounded">{CONFIRM_MSG.BULK_UPDATE_WARNING}</p>
            <MonacoJsonEditor value={s.bulkUpdateJson} onChange={(val) => s.setBulkUpdateJson(val || "")} height="240px" onSave={docActions.handleBulkUpdate} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowBulkUpdateModal(false)}>{LABEL.CANCEL}</Button><Button onClick={docActions.handleBulkUpdate} disabled={docActions.bulkOp.isPending} className="bg-violet-600 hover:bg-violet-700 text-white">{docActions.bulkOp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Update ${s.selectedDocs.size} Docs`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm */}
      <Dialog open={s.showSingleDeleteConfirm} onOpenChange={s.setShowSingleDeleteConfirm}>
        <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-destructive" />{MODAL_TITLE.DELETE_DOCUMENT}</DialogTitle></DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">{CONFIRM_MSG.DELETE_DOCUMENT}</div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowSingleDeleteConfirm(false)}>{LABEL.CANCEL}</Button><Button variant="destructive" onClick={() => { if (s.docToDelete) docActions.handleDeleteDoc(s.docToDelete); s.setShowSingleDeleteConfirm(false); s.setDocToDelete(null); }}>{LABEL.DELETE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Confirm */}
      <Dialog open={s.showDuplicateConfirm} onOpenChange={s.setShowDuplicateConfirm}>
        <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Copy className="w-5 h-5 text-primary" />{MODAL_TITLE.DUPLICATE_DOCUMENT}</DialogTitle></DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">{CONFIRM_MSG.DUPLICATE_DOCUMENT}</div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowDuplicateConfirm(false)}>{LABEL.CANCEL}</Button><Button onClick={() => void docActions.executeDuplicateDoc()}>{LABEL.DUPLICATE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Index */}
      <Dialog open={s.showIndexModal} onOpenChange={s.setShowIndexModal}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-primary" />{MODAL_TITLE.CREATE_INDEX}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Custom Index Name (Optional)</label>
              <Input value={s.newIndexName} onChange={(e) => s.setNewIndexName(e.target.value)} placeholder="e.g. user_age_idx" className="h-8 text-xs font-mono" />
            </div>
            <Tabs value={s.indexBuildMode} onValueChange={(v) => s.setIndexBuildMode(v as "visual" | "json")}>
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="visual" className="text-[10px] h-7">Visual Builder</TabsTrigger><TabsTrigger value="json" className="text-[10px] h-7">Raw JSON</TabsTrigger></TabsList>
              <div className="mt-3">
                {s.indexBuildMode === "visual" ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {s.indexKeysBuilder.map((item, keyIdx) => (
                      <div key={keyIdx} className="flex items-center gap-2">
                        <Select value={item.field} onValueChange={(val) => { const next = [...s.indexKeysBuilder]; next[keyIdx].field = val; s.setIndexKeysBuilder(next); }}>
                          <SelectTrigger className="h-8 text-xs flex-1 font-mono"><SelectValue placeholder="Select Field" /></SelectTrigger>
                          <SelectContent>{schemaData?.fields?.map((f: any) => <SelectItem key={f.path} value={f.path} className="font-mono text-xs">{f.path}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={item.type} onValueChange={(val) => { const next = [...s.indexKeysBuilder]; next[keyIdx].type = val as any; s.setIndexKeysBuilder(next); }}>
                          <SelectTrigger className="h-8 text-xs w-36 font-mono"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="1" className="font-mono text-xs">Ascending (1)</SelectItem><SelectItem value="-1" className="font-mono text-xs">Descending (-1)</SelectItem><SelectItem value="text" className="font-mono text-xs">Text</SelectItem><SelectItem value="2dsphere" className="font-mono text-xs">Geospatial (2dsphere)</SelectItem></SelectContent>
                        </Select>
                        {s.indexKeysBuilder.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => s.setIndexKeysBuilder(s.indexKeysBuilder.filter((_, idx) => idx !== keyIdx))}><Trash2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1 font-mono w-full" onClick={() => s.setIndexKeysBuilder([...s.indexKeysBuilder, { field: "", type: "1" }])}><Plus className="w-3 h-3" />Add Index Key Row</Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Index Keys Spec (JSON)</label>
                    <Textarea value={s.newIndexKeys} onChange={(e) => s.setNewIndexKeys(e.target.value)} placeholder='{ "field": 1, "anotherField": -1 }' className="font-mono text-xs h-24 mt-1" />
                  </div>
                )}
              </div>
            </Tabs>
            <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2.5 rounded-lg border border-border/40">
              <div className="flex items-center gap-2 select-none"><input type="checkbox" id="unique-idx" checked={s.newIndexUnique} onChange={(e) => s.setNewIndexUnique(e.target.checked)} className="rounded accent-primary" /><label htmlFor="unique-idx" className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">Unique Index</label></div>
              <div className="flex items-center gap-2 select-none"><input type="checkbox" id="sparse-idx" checked={s.newIndexSparse} onChange={(e) => s.setNewIndexSparse(e.target.checked)} className="rounded accent-primary" /><label htmlFor="sparse-idx" className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">Sparse Index</label></div>
            </div>
            <div className="border border-border/40 p-2.5 rounded-lg space-y-2">
              <div className="flex items-center gap-2 select-none"><input type="checkbox" id="ttl-idx" checked={s.newIndexTTL} onChange={(e) => s.setNewIndexTTL(e.target.checked)} className="rounded accent-primary" /><label htmlFor="ttl-idx" className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">TTL Index (Expire documents)</label></div>
              {s.newIndexTTL && <div className="flex items-center gap-2 pl-6"><span className="text-[10px] text-muted-foreground font-mono">Expire after:</span><Input type="number" value={s.newIndexTTLExpires} onChange={(e) => s.setNewIndexTTLExpires(e.target.value)} className="h-7 text-xs w-24 font-mono text-center" /><span className="text-[10px] text-muted-foreground font-mono">seconds</span></div>}
            </div>
            <div className="space-y-1.5 border border-border/30 rounded-lg p-2.5 bg-muted/10">
              <button type="button" className="flex items-center justify-between w-full text-muted-foreground hover:text-foreground font-semibold text-[10px] uppercase tracking-wider" onClick={() => s.setShowAdvancedIndex(!s.showAdvancedIndex)}>
                <span>Advanced Options JSON</span>{s.showAdvancedIndex ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {s.showAdvancedIndex && <Textarea value={s.newIndexAdvancedJSON} onChange={(e) => s.setNewIndexAdvancedJSON(e.target.value)} placeholder='{ "collation": { "locale": "en", "strength": 2 } }' className="font-mono text-xs h-16 mt-2" />}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowIndexModal(false)} className="h-8 text-xs">{LABEL.CANCEL}</Button><Button onClick={indexManager.handleCreateIndex} disabled={indexManager.createIndex.isPending} className="h-8 text-xs">{indexManager.createIndex.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.CREATE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Query */}
      <Dialog open={s.showSaveQueryModal} onOpenChange={s.setShowSaveQueryModal}>
        <DialogContent><DialogHeader><DialogTitle>{MODAL_TITLE.SAVE_QUERY}</DialogTitle></DialogHeader>
          <Input placeholder="Query name" value={s.saveQueryName} onChange={(e) => s.setSaveQueryName(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => s.setShowSaveQueryModal(false)}>{LABEL.CANCEL}</Button><Button onClick={queryActions.handleSaveQuery} disabled={!s.saveQueryName || queryActions.saveQuery.isPending}>{LABEL.SAVE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={s.showImportModal} onOpenChange={s.setShowImportModal}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{MODAL_TITLE.IMPORT_DATA}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={s.importFormat} onValueChange={(v) => s.setImportFormat(v as "json" | "csv")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="json">JSON</SelectItem><SelectItem value="csv">CSV</SelectItem></SelectContent>
            </Select>
            <div
              onDragOver={(e) => { e.preventDefault(); s.setIsDragOver(true); }}
              onDragLeave={() => s.setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); s.setIsDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) importExport.handleImportFile(file); }}
              onClick={() => document.getElementById("file-import-input")?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${s.isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-muted/10"}`}
            >
              <input type="file" id="file-import-input" className="hidden" accept=".json,.csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) importExport.handleImportFile(file); }} />
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <Upload className="w-8 h-8 text-muted-foreground/60 mb-0.5 animate-pulse" />
                <p className="text-xs font-medium text-foreground">Drag & drop JSON/CSV here, or <span className="text-primary hover:underline">browse</span></p>
                <p className="text-[10px]">Max performance rendering limit: 150 KB</p>
              </div>
            </div>
            {s.importFileName && (
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/80 bg-muted/30 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <FileJson className="w-4 h-4 text-primary/80 shrink-0" />
                  <div className="truncate"><p className="font-medium truncate text-foreground">{s.importFileName}</p><p className="text-[9px] text-muted-foreground">{formatBytes(s.importFileSize)}</p></div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-rose-500 hover:text-rose-600 text-[10px] shrink-0" onClick={(e) => { e.stopPropagation(); s.setImportData(""); s.setImportFileName(""); s.setImportFileSize(0); }}>Remove</Button>
              </div>
            )}
            {s.importFileTooLarge ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div><p className="font-semibold">File exceeds browser limit ({(s.importFileSize / (1024 * 1024)).toFixed(1)} MB)</p><p className="text-muted-foreground mt-1 text-[11px]">Use mongoimport in your terminal instead:</p></div>
                </div>
                <div className="relative group">
                  <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap break-all select-all pr-12 border border-border/80">{s.importCliCommand}</pre>
                  <Button size="sm" variant="ghost" className="absolute right-2 top-2 h-7 w-7 p-0 opacity-80 hover:opacity-100 bg-zinc-900 border border-zinc-800 text-zinc-300" onClick={() => { navigator.clipboard.writeText(s.importCliCommand); toast({ title: TOAST.CLIPBOARD_COPIED }); }} title="Copy to clipboard"><Copy className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ) : s.importFileSize > IMPORT_PREVIEW_MAX_BYTES ? (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Large file loaded ({(s.importFileSize / 1024).toFixed(0)} KB). Preview editor hidden. Click Import to import directly.</span>
              </div>
            ) : s.importFormat === "json" ? (
              <MonacoJsonEditor value={s.importData} onChange={(val) => s.setImportData(val || "")} height="180px" />
            ) : (
              <Textarea value={s.importData} onChange={(e) => s.setImportData(e.target.value)} className="font-mono text-xs h-40 resize-none" placeholder="name,value&#10;example,42" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => s.setShowImportModal(false)}>{LABEL.CANCEL}</Button>
            <Button onClick={importExport.handleImportSubmit} disabled={!s.importData || s.importFileTooLarge}>{LABEL.IMPORT}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export */}
      <Dialog open={s.showExportModal} onOpenChange={s.setShowExportModal}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Download className="w-5 h-5 text-primary" />{MODAL_TITLE.EXPORT_COLLECTION}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-xs py-2">
            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground">Export Format</label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={s.exportFormat === "json" ? "default" : "outline"} className="h-8 text-xs justify-center" onClick={() => s.setExportFormat("json")}>JSON (.json)</Button>
                <Button type="button" variant={s.exportFormat === "csv" ? "default" : "outline"} className="h-8 text-xs justify-center" onClick={() => s.setExportFormat("csv")}>CSV (.csv)</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground">Select Range</label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={s.exportRange === "query" ? "default" : "outline"} className="h-8 text-xs justify-start px-3 font-mono" onClick={() => s.setExportRange("query")}>Query: {s.appliedFilterStr.length > 25 ? s.appliedFilterStr.slice(0, 22) + "..." : s.appliedFilterStr}</Button>
                <Button type="button" variant={s.exportRange === "selected" ? "default" : "outline"} className="h-8 text-xs justify-start px-3 gap-1.5" onClick={() => s.setExportRange("selected")}>Selected rows ({s.selectedDocs.size})</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground">Max Limit</label>
              <Input type="number" value={s.exportLimit || ""} onChange={(e) => s.setExportLimit(Math.max(0, parseInt(e.target.value) || 0))} placeholder="1000" min={1} max={10000} className="h-8 text-xs font-mono" />
              <p className="text-[10px] text-muted-foreground">Up to 10,000 records can be exported client-side.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => s.setShowExportModal(false)} className="h-8 text-xs">{LABEL.CANCEL}</Button>
            <Button type="button" onClick={importExport.handleExport} disabled={importExport.exportCol.isPending} className="h-8 text-xs gap-1.5">{importExport.exportCol.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}{LABEL.EXPORT_DATA}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Collection */}
      <Dialog open={s.showCreateColModal} onOpenChange={s.setShowCreateColModal}>
        <DialogContent><DialogHeader><DialogTitle>{MODAL_TITLE.CREATE_COLLECTION}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Database: <span className="font-mono">{database}</span></p>
            <Input placeholder="Collection name" value={s.newColName} onChange={(e) => s.setNewColName(e.target.value)} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowCreateColModal(false)}>{LABEL.CANCEL}</Button><Button onClick={handleCreateCollection} disabled={!s.newColName || createCol.isPending}>{createCol.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.CREATE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Database */}
      <Dialog open={s.showDropDbModal} onOpenChange={s.setShowDropDbModal}>
        <DialogContent><DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertCircle className="w-5 h-5" />{MODAL_TITLE.DROP_DATABASE}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">{CONFIRM_MSG.DROP_DATABASE(s.dbToDrop)}</p>
            <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded border border-destructive/20">{CONFIRM_MSG.DROP_DATABASE_WARNING}</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowDropDbModal(false)}>{LABEL.CANCEL}</Button><Button variant="destructive" onClick={handleDropDatabase} disabled={dropDb.isPending}>{dropDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.DROP_DATABASE}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Collection */}
      <Dialog open={s.showDropColModal} onOpenChange={s.setShowDropColModal}>
        <DialogContent><DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertCircle className="w-5 h-5" />{MODAL_TITLE.DROP_COLLECTION}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">{CONFIRM_MSG.DROP_COLLECTION(s.colToDrop, s.colToDropDb)}</p>
            <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded border border-destructive/20">{CONFIRM_MSG.DROP_COLLECTION_WARNING}</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => s.setShowDropColModal(false)}>{LABEL.CANCEL}</Button><Button variant="destructive" onClick={handleDropCollection} disabled={dropCol.isPending}>{dropCol.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : LABEL.DROP_COLLECTION}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Floating Bulk Action Bar */}
      {isMobile && s.selectedDocs.size > 0 && (
        <div
          className="fixed bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+12px)] left-4 right-4 z-40 bg-card/95 backdrop-blur-md border border-border/80 rounded-full shadow-2xl p-2.5 flex items-center justify-between animate-in slide-in-from-bottom-5 duration-300"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <div className="flex items-center gap-2 pl-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold">
              {s.selectedDocs.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full text-xs text-muted-foreground"
              onClick={() => s.setSelectedDocs(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full text-xs gap-1 border-violet-500/30 text-violet-400 bg-violet-500/5 hover:bg-violet-500/10"
              onClick={() => {
                s.setBulkUpdateJson(`{\n  "$set": {\n    \n  }\n}`);
                s.setShowBulkUpdateModal(true);
              }}
            >
              Update
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 rounded-full text-xs gap-1 px-3"
              onClick={docActions.handleBulkDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DashboardContent (kept as local component — only used here) ───────────────
function DashboardContent({ connectionId, database, collection, schemaData }: {
  connectionId: string; database: string; collection: string; schemaData: any;
}) {
  const executeAgg = useExecuteAggregate();
  const [charts, setCharts] = useState<{ field: string; type: string; data: any[] }[]>([]);
  const [loading, setLoading] = useState(false);

  const generateCharts = useCallback(async () => {
    if (!schemaData?.fields || loading) return;
    setLoading(true);
    const newCharts: { field: string; type: string; data: any[] }[] = [];
    const chartableFields = schemaData.fields.filter((f: any) => f.path !== "_id" && ["string", "number", "boolean", "date"].includes(f.type)).slice(0, 5);
    for (const field of chartableFields) {
      try {
        let pipeline: any[], chartType = "bar";
        if (field.type === "date") {
          chartType = "line";
          pipeline = [{ $match: { [field.path]: { $ne: null } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field.path}` } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 30 }];
        } else {
          chartType = field.type === "string" || field.type === "boolean" ? "pie" : "bar";
          pipeline = [{ $match: { [field.path]: { $ne: null } } }, { $group: { _id: `$${field.path}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }];
        }
        const result = await executeAgg!.mutateAsync({ connectionId, dbName: database, collectionName: collection, data: { pipeline } });
        if (result.documents?.length > 0) {
          newCharts.push({ field: field.path, type: chartType, data: result.documents.map((d: any) => ({ name: String(d._id === null ? "null" : d._id), value: d.count })) });
        }
      } catch { /* skip field */ }
    }
    setCharts(newCharts);
    setLoading(false);
  }, [schemaData, connectionId, database, collection]);

  useEffect(() => { generateCharts(); }, [schemaData]);

  if (!schemaData && !loading) return <div className="p-8 text-center text-muted-foreground">Analyze schema first to see dashboard</div>;
  if (loading && charts.length === 0) return <div className="p-8 space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Collection Dashboard</h2>
        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={generateCharts} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />Refresh Dashboard</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {charts.map((chart, idx) => (
          <div key={idx} className="bg-card border border-border p-4 rounded-lg shadow-sm">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Distribution of <span className="font-mono text-primary">{chart.field}</span></h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chart.type === "pie" ? (
                  <PieChart><Pie data={chart.data} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" label={false}>{chart.data.map((_, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} /><Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} iconSize={8} layout="horizontal" verticalAlign="bottom" align="center" /></PieChart>
                ) : chart.type === "line" ? (
                  <LineChart data={chart.data} margin={{ bottom: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted)/0.2)" /><XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} /><YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} /><RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart>
                ) : (
                  <BarChart data={chart.data} margin={{ bottom: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted)/0.2)" /><XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} /><YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} /><RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ))}
        {charts.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-xl"><AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-20" /><p className="text-muted-foreground">No chartable fields detected in this collection.</p></div>
        )}
      </div>
    </div>
  );
}
