import { useState, useCallback } from "react";
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
  AlertCircle, CheckCircle, XCircle, Eye,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertJson, setInsertJson] = useState("{\n  \n}");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [queryFilter, setQueryFilter] = useState("{}");
  const [querySort, setQuerySort] = useState("{}");
  const [queryLimit, setQueryLimit] = useState("20");
  const [queryResults, setQueryResults] = useState<Record<string, unknown>[] | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [aggregatePipeline, setAggregatePipeline] = useState('[\n  { "$match": {} }\n]');
  const [newIndexKeys, setNewIndexKeys] = useState('{ "field": 1 }');
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

  const parseFilter = useCallback((str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  }, []);

  const { data: dbsData, isLoading: dbsLoading } = useListDatabases(connectionId, {
    query: { enabled: !!connectionId, queryKey: getListDatabasesQueryKey(connectionId) }
  });

  const { data: colsData, isLoading: colsLoading } = useListCollections(connectionId, database, {
    query: { enabled: !!connectionId && !!database, queryKey: getListCollectionsQueryKey(connectionId, database) }
  });

  const { data: docsData, isLoading: docsLoading } = useListDocuments(
    connectionId, database, collection,
    { page, limit, filter: filterStr !== "{}" ? filterStr : undefined, sort: sortStr !== "{}" ? sortStr : undefined },
    { query: { enabled: !!connectionId && !!database && !!collection, queryKey: getListDocumentsQueryKey(connectionId, database, collection, { page, limit }) } }
  );

  const { data: schemaData, isLoading: schemaLoading } = useAnalyzeSchema(connectionId, database, collection, {}, {
    query: { enabled: !!connectionId && !!database && !!collection && activeTab === "schema", queryKey: getAnalyzeSchemaQueryKey(connectionId, database, collection, {}) }
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

  const handleRunQuery = async () => {
    try {
      const result = await executeQuery.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: {
          filter: parseFilter(queryFilter),
          sort: parseFilter(querySort),
          limit: Number(queryLimit) || 20,
        }
      });
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(result.executionTimeMs);
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRunAggregate = async () => {
    try {
      const pipeline = JSON.parse(aggregatePipeline);
      const result = await executeAggregate.mutateAsync({
        connectionId, dbName: database, collectionName: collection,
        data: { pipeline }
      });
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(result.executionTimeMs);
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

  const docs = docsData?.documents as Record<string, unknown>[] || [];
  const allFields = docs.length > 0 ? Array.from(new Set(docs.flatMap(d => Object.keys(d)))).slice(0, 8) : [];

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
                  <button
                    onClick={() => {
                      setExpandedDbs(prev => {
                        const next = new Set(prev);
                        if (next.has(db.name)) next.delete(db.name);
                        else next.add(db.name);
                        return next;
                      });
                      setLocation(`/explorer/${connectionId}/${db.name}`);
                    }}
                    data-testid={`db-${db.name}`}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-sidebar-accent transition-colors ${database === db.name ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80"}`}
                  >
                    {expandedDbs.has(db.name) ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                    <Database className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                    <span className="truncate font-mono text-xs">{db.name}</span>
                    {db.collectionCount !== undefined && (
                      <span className="ml-auto text-xs text-muted-foreground">{db.collectionCount}</span>
                    )}
                  </button>

                  {expandedDbs.has(db.name) && database === db.name && (
                    <div className="ml-3 pl-2 border-l border-border">
                      {colsLoading ? (
                        <div className="space-y-1 py-1">
                          {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
                        </div>
                      ) : (
                        colsData?.collections?.map((col) => (
                          <button
                            key={col.name}
                            onClick={() => {
                              setPage(1);
                              setLocation(`/explorer/${connectionId}/${db.name}/${col.name}`);
                            }}
                            data-testid={`collection-${col.name}`}
                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-sidebar-accent transition-colors ${collection === col.name ? "bg-primary/20 text-primary" : "text-sidebar-foreground/70"}`}
                          >
                            <Layers className="w-3 h-3 shrink-0" />
                            <span className="truncate font-mono">{col.name}</span>
                            {col.documentCount !== undefined && (
                              <span className="ml-auto text-muted-foreground">{col.documentCount.toLocaleString()}</span>
                            )}
                          </button>
                        ))
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
              <TabsTrigger value="documents" className="gap-1.5 text-xs h-8" data-testid="tab-documents">
                <Table className="w-3.5 h-3.5" /> Documents
              </TabsTrigger>
              <TabsTrigger value="schema" className="gap-1.5 text-xs h-8" data-testid="tab-schema">
                <Layers className="w-3.5 h-3.5" /> Schema
              </TabsTrigger>
              <TabsTrigger value="query" className="gap-1.5 text-xs h-8" data-testid="tab-query">
                <Code className="w-3.5 h-3.5" /> Query
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

            {/* DOCUMENTS TAB */}
            <TabsContent value="documents" className="flex-1 flex flex-col overflow-hidden m-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={filterStr}
                  onChange={e => setFilterStr(e.target.value)}
                  placeholder='Filter: { "field": "value" }'
                  className="h-7 text-xs font-mono flex-1"
                  data-testid="input-filter"
                />
                <SortAsc className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={sortStr}
                  onChange={e => setSortStr(e.target.value)}
                  placeholder='Sort: { "field": -1 }'
                  className="h-7 text-xs font-mono w-40"
                  data-testid="input-sort"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => { setPage(1); queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) }); }}
                >
                  <RefreshCw className="w-3 h-3" /> Apply
                </Button>
                {selectedDocs.size > 0 && (
                  <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleBulkDelete}>
                    <Trash2 className="w-3 h-3" /> Delete {selectedDocs.size}
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-auto">
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
                ) : (
                  <div className="divide-y divide-border">
                    {/* Table header */}
                    <div className="flex items-center bg-card px-4 py-2 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                      <div className="w-8 shrink-0">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedDocs.size === docs.length && docs.length > 0}
                          onChange={e => setSelectedDocs(e.target.checked ? new Set(docs.map(d => String(d._id))) : new Set())}
                        />
                      </div>
                      {allFields.map(f => (
                        <div key={f} className="flex-1 min-w-0 px-2 truncate font-mono">{f}</div>
                      ))}
                      <div className="w-20 shrink-0 text-right">Actions</div>
                    </div>

                    {docs.map((doc) => {
                      const docId = String(doc._id || "");
                      const isExpanded = expandedDocs.has(docId);
                      return (
                        <div key={docId} data-testid={`row-doc-${docId}`}>
                          <div className="flex items-center px-4 py-2 hover:bg-muted/20 transition-colors">
                            <div className="w-8 shrink-0">
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedDocs.has(docId)}
                                onChange={e => {
                                  setSelectedDocs(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(docId);
                                    else next.delete(docId);
                                    return next;
                                  });
                                }}
                              />
                            </div>
                            {allFields.map(f => (
                              <div key={f} className="flex-1 min-w-0 px-2">
                                <span className="text-xs font-mono truncate block max-w-[120px]">
                                  {doc[f] === null ? (
                                    <span className="text-muted-foreground">null</span>
                                  ) : doc[f] === undefined ? (
                                    <span className="text-muted-foreground/50">—</span>
                                  ) : typeof doc[f] === "object" ? (
                                    <span className="text-blue-400">{"{…}"}</span>
                                  ) : (
                                    <span>{String(doc[f]).slice(0, 40)}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                            <div className="w-20 shrink-0 flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedDocs(prev => { const n = new Set(prev); if (n.has(docId)) n.delete(docId); else n.add(docId); return n; })}
                              >
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-400"
                                onClick={() => {
                                  setEditDocId(docId);
                                  const { _id, ...rest } = doc;
                                  setEditJson(JSON.stringify(rest, null, 2));
                                  setShowEditModal(true);
                                }}
                              >
                                <Settings className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteDoc(docId)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-12 py-3 bg-muted/10 border-t border-border font-mono text-xs">
                              <JsonTree data={doc} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Sample: <strong className="text-foreground">{schemaData.sampleSize}</strong> docs</span>
                    <span>Total: <strong className="text-foreground">{schemaData.documentCount?.toLocaleString()}</strong></span>
                    <span>Fields: <strong className="text-foreground">{schemaData.fields?.length}</strong></span>
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

            {/* QUERY TAB */}
            <TabsContent value="query" className="flex-1 flex flex-col overflow-hidden m-0">
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Filter</label>
                    <Textarea
                      value={queryFilter}
                      onChange={e => setQueryFilter(e.target.value)}
                      className="font-mono text-xs h-24 resize-none"
                      data-testid="textarea-query-filter"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Sort</label>
                    <Textarea
                      value={querySort}
                      onChange={e => setQuerySort(e.target.value)}
                      className="font-mono text-xs h-24 resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Limit</label>
                    <Input value={queryLimit} onChange={e => setQueryLimit(e.target.value)} className="h-7 text-xs w-20 font-mono" />
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleRunQuery} disabled={executeQuery.isPending} data-testid="button-run-query">
                    {executeQuery.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run Find
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleExplain} disabled={explainQuery.isPending}>
                    <Eye className="w-3.5 h-3.5" /> Explain
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setShowSaveQueryModal(true)}>
                    <Star className="w-3.5 h-3.5" /> Save
                  </Button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Aggregation Pipeline</label>
                  <Textarea
                    value={aggregatePipeline}
                    onChange={e => setAggregatePipeline(e.target.value)}
                    className="font-mono text-xs h-28 resize-none"
                    data-testid="textarea-pipeline"
                  />
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleRunAggregate} disabled={executeAggregate.isPending}>
                    {executeAggregate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run Aggregate
                  </Button>
                </div>

                {queryTime !== null && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{queryTime}ms</Badge>
                    <span className="text-xs text-muted-foreground">{queryResults?.length || 0} results</span>
                  </div>
                )}

                {queryResults && queryResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="divide-y divide-border max-h-80 overflow-auto">
                      {queryResults.map((doc, i) => (
                        <div key={i} className="px-4 py-2 font-mono text-xs hover:bg-muted/20">
                          <JsonTree data={doc} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      ) : chartType === "line" ? (
                        <LineChart data={chartData.slice(0, 50)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey={chartXField} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey={chartYField} stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      ) : (
                        <BarChart data={chartData.slice(0, 30)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey={chartXField} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
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

      {/* Create Index Modal */}
      <Dialog open={showIndexModal} onOpenChange={setShowIndexModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Index</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Keys (JSON)</label>
              <Textarea value={newIndexKeys} onChange={e => setNewIndexKeys(e.target.value)} className="font-mono text-xs h-20 mt-1" />
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
    </div>
  );
}
