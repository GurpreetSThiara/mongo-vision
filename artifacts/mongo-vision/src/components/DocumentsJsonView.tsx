import { useState, useCallback, useMemo, memo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Pin,
  Plus,
  ChevronsDownUp,
  ChevronsUpDown,
  Braces,
  FileJson,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface DocumentsJsonViewProps {
  docs: Record<string, unknown>[];
  pinnedDocIds: Set<string>;
  onTogglePin: (docId: string) => void;
  onCopy: (doc: Record<string, unknown>) => void;
  onDuplicate: (doc: Record<string, unknown>) => void;
  searchQuery?: string;
  onOpenDocument?: (doc: Record<string, unknown>) => void;
  compareMode?: boolean;
  compareDocs?: string[];
  onToggleCompare?: (docId: string, checked: boolean) => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedString({ value, query }: { value: string; query: string }) {
  const q = query.trim();
  if (!q) {
    return <span className="text-emerald-600 dark:text-emerald-400/90 break-all">"{value}"</span>;
  }
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = value.split(re);
  return (
    <span className="break-all">
      <span className="text-muted-foreground">"</span>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-500/35 text-inherit px-0.5 not-italic"
          >
            {part}
          </mark>
        ) : (
          <span key={i} className="text-emerald-600 dark:text-emerald-400/90">
            {part}
          </span>
        ),
      )}
      <span className="text-muted-foreground">"</span>
    </span>
  );
}

/** Long strings: ellipsis / line-clamp until clicked; auto-expand if page search matches. */
function SmartString({ value, query }: { value: string; query: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = value.length > 88 || /[\r\n]/.test(value);
  const q = query.trim();
  const hasHit = Boolean(q && value.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (hasHit) setExpanded(true);
  }, [hasHit, q]);

  if (!long) return <HighlightedString value={value} query={query} />;

  if (expanded) {
    return (
      <span className="inline-block max-w-full align-top">
        <button
          type="button"
          className="text-left w-full rounded-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded(false)}
        >
          <HighlightedString value={value} query={query} />
        </button>
        <span className="text-[9px] text-muted-foreground not-italic select-none"> · click to collapse</span>
      </span>
    );
  }

  const singleLine = value.replace(/\s+/g, " ");
  const preview = singleLine.slice(0, 72);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-left max-w-full align-top line-clamp-2 break-all rounded px-0.5 -mx-0.5 hover:bg-muted/60 text-emerald-600 dark:text-emerald-400/90"
          onClick={() => setExpanded(true)}
        >
          <span className="text-muted-foreground">"</span>
          {preview}
          <span className="text-muted-foreground">…"</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        Long text is shortened. Click to show the full value.
      </TooltipContent>
    </Tooltip>
  );
}

const JsonPrimitive = memo(function JsonPrimitive({
  value,
  searchQuery,
}: {
  value: unknown;
  searchQuery: string;
}) {
  if (value === null) {
    return <span className="text-rose-500 dark:text-rose-400 font-medium">null</span>;
  }
  if (value === undefined) {
    return <span className="text-muted-foreground italic">undefined</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-violet-600 dark:text-violet-400 font-medium">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-amber-600 dark:text-amber-400 tabular-nums">{String(value)}</span>;
  }
  if (typeof value === "string") {
    return <SmartString value={value} query={searchQuery} />;
  }
  return <span className="text-foreground">{String(value)}</span>;
});

type JsonNodeProps = {
  data: unknown;
  depth: number;
  collapseFromDepth: number;
  searchQuery: string;
};

const JsonNode = memo(function JsonNode({ data, depth, collapseFromDepth, searchQuery }: JsonNodeProps) {
  const [collapsed, setCollapsed] = useState(() => depth >= collapseFromDepth);

  if (data === null || data === undefined || typeof data === "boolean" || typeof data === "number" || typeof data === "string") {
    return <JsonPrimitive value={data} searchQuery={searchQuery} />;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }
    return (
      <span className="block w-full min-w-0 align-top">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="inline-flex items-center gap-0.5 rounded px-0.5 -mx-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
              <span className="text-sky-600/80 dark:text-sky-400/80 font-medium text-[11px] tabular-nums">[{data.length}]</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {collapsed ? "Expand" : "Collapse"} array · {data.length} item{data.length !== 1 ? "s" : ""}
          </TooltipContent>
        </Tooltip>
        {!collapsed && (
          <div
            className="ml-4 mt-0.5 border-l border-border/60 pl-2.5 space-y-0.5"
            style={{ marginLeft: "0.65rem" }}
          >
            {data.map((item, i) => (
              <div
                key={i}
                className="group/row flex flex-wrap items-start gap-x-1.5 gap-y-0.5 py-px rounded-sm hover:bg-muted/40 -mx-1 px-1 w-full min-w-0"
              >
                <span className="text-muted-foreground/70 tabular-nums text-[10px] w-6 shrink-0 text-right pt-0.5 select-none">
                  {i}
                </span>
                <span className="text-muted-foreground shrink-0">:</span>
                <span className="min-w-0 flex-1 basis-0 text-[11px] leading-relaxed font-mono">
                  <JsonNode
                    data={item}
                    depth={depth + 1}
                    collapseFromDepth={collapseFromDepth}
                    searchQuery={searchQuery}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data as object);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{"{}"}</span>;
    }
    return (
      <span className="block w-full min-w-0 align-top">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="inline-flex items-center gap-0.5 rounded px-0.5 -mx-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
              <span className="text-sky-600/80 dark:text-sky-400/80 font-medium text-[11px]">
                {"{"}
                {keys.length}
                {"}"}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {collapsed ? "Expand" : "Collapse"} object · {keys.length} key{keys.length !== 1 ? "s" : ""}
          </TooltipContent>
        </Tooltip>
        {!collapsed && (
          <div
            className="ml-4 mt-0.5 border-l border-border/60 pl-2.5 space-y-0.5"
            style={{ marginLeft: "0.65rem" }}
          >
            {keys.map((k) => (
              <div
                key={k}
                className="group/row flex flex-wrap items-start gap-x-1.5 gap-y-0.5 py-px rounded-sm hover:bg-muted/40 -mx-1 px-1 w-full min-w-0"
              >
                <span className="text-sky-600 dark:text-sky-400 shrink-0 font-medium text-[11px]">
                  &quot;{k}&quot;
                </span>
                <span className="text-muted-foreground shrink-0">:</span>
                <span className="min-w-0 flex-1 basis-0 text-[11px] leading-relaxed font-mono">
                  <JsonNode
                    data={(data as Record<string, unknown>)[k]}
                    depth={depth + 1}
                    collapseFromDepth={collapseFromDepth}
                    searchQuery={searchQuery}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <JsonPrimitive value={data} searchQuery={searchQuery} />;
});

function JsonKeyRow({
  k,
  doc,
  collapseFromDepth,
  searchQuery,
}: {
  k: string;
  doc: Record<string, unknown>;
  collapseFromDepth: number;
  searchQuery: string;
}) {
  return (
    <div
      className="group/row flex flex-wrap items-start gap-x-1.5 gap-y-0.5 py-0.5 rounded-md hover:bg-muted/50 -mx-1 px-1 transition-colors w-full min-w-0"
    >
      <span className="text-sky-600 dark:text-sky-400 shrink-0 font-medium text-[11px]">&quot;{k}&quot;</span>
      <span className="text-muted-foreground shrink-0">:</span>
      <span className="min-w-0 flex-1 basis-0 text-[11px] leading-relaxed">
        <JsonNode
          data={doc[k]}
          depth={1}
          collapseFromDepth={collapseFromDepth}
          searchQuery={searchQuery}
        />
      </span>
    </div>
  );
}

function JsonDocumentRoot({
  doc,
  collapseFromDepth,
  searchQuery,
}: {
  doc: Record<string, unknown>;
  collapseFromDepth: number;
  searchQuery: string;
}) {
  const { leftKeys, rightKeys } = useMemo(() => {
    const k = Object.keys(doc);
    const mid = Math.ceil(k.length / 2);
    return { leftKeys: k.slice(0, mid), rightKeys: k.slice(mid) };
  }, [doc]);

  const renderColumn = (keyList: string[]) => (
    <div className="space-y-0.5 w-full min-w-0">
      {keyList.map((k) => (
        <JsonKeyRow key={k} k={k} doc={doc} collapseFromDepth={collapseFromDepth} searchQuery={searchQuery} />
      ))}
    </div>
  );

  if (leftKeys.length === 0 && rightKeys.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic py-1">Empty document</p>;
  }

  return (
    <div className="w-full min-w-0 lg:grid lg:grid-cols-2 lg:gap-x-8 xl:gap-x-12 lg:items-start">
      <div className="min-w-0">{renderColumn(leftKeys)}</div>
      <div className="min-w-0 mt-6 lg:mt-0 pt-6 lg:pt-0 border-t lg:border-t-0 border-border/50 lg:border-l lg:border-border/40 lg:pl-8">
        {rightKeys.length > 0 ? (
          renderColumn(rightKeys)
        ) : (
          <p className="text-[10px] text-muted-foreground italic lg:py-1">—</p>
        )}
      </div>
    </div>
  );
}

function DocumentJsonCard({
  doc,
  docId,
  pinned,
  searchQuery,
  onTogglePin,
  onCopy,
  onDuplicate,
  onOpenDocument,
  compareMode,
  compareDocs,
  onToggleCompare,
  onCopyDocumentId,
}: {
  doc: Record<string, unknown>;
  docId: string;
  pinned: boolean;
  searchQuery: string;
  onTogglePin: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onOpenDocument?: () => void;
  compareMode?: boolean;
  compareDocs?: string[];
  onToggleCompare?: (docId: string, checked: boolean) => void;
  onCopyDocumentId: (id: string) => void;
}) {
  const [collapseFromDepth, setCollapseFromDepth] = useState(1);
  const [treeKey, setTreeKey] = useState(0);

  const expandAll = useCallback(() => {
    setCollapseFromDepth(64);
    setTreeKey((k) => k + 1);
  }, []);

  const collapseAll = useCallback(() => {
    setCollapseFromDepth(1);
    setTreeKey((k) => k + 1);
  }, []);

  const idPreview = useMemo(() => {
    if (docId.length <= 28) return docId;
    return `${docId.slice(0, 12)}…${docId.slice(-8)}`;
  }, [docId]);

  const inCompare = compareDocs?.includes(docId) ?? false;
  const compareDisabled = compareMode && (compareDocs?.length ?? 0) >= 2 && !inCompare;

  return (
    <article
      className={`group/card w-full rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
        pinned ? "border-amber-500/50 ring-1 ring-amber-500/20 bg-amber-500/3" : "border-border/80"
      } ${inCompare ? "ring-1 ring-violet-500/40 border-violet-500/30" : ""}`}
    >
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-gradient-to-b from-muted/50 to-muted/20 px-3 py-2 backdrop-blur-sm">
        {compareMode && onToggleCompare && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <input
                  type="checkbox"
                  className="rounded accent-violet-500 w-3.5 h-3.5"
                  checked={inCompare}
                  disabled={compareDisabled}
                  onChange={(e) => onToggleCompare(docId, e.target.checked)}
                  aria-label="Compare document"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {compareDisabled
                ? "Compare allows only two documents — clear one to pick another"
                : inCompare
                  ? "Remove from compare"
                  : "Add to compare (pick two documents)"}
            </TooltipContent>
          </Tooltip>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Braces className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">_id</p>
            <button
              type="button"
              className="truncate font-mono text-[11px] text-left text-foreground hover:text-primary hover:underline underline-offset-2 max-w-full block"
              title={`${docId} — click to copy`}
              onClick={() => onCopyDocumentId(docId)}
            >
              {idPreview}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1 text-muted-foreground"
                onClick={expandAll}
              >
                <ChevronsDownUp className="w-3 h-3" />
                <span className="hidden sm:inline">Expand</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Expand all nested objects and arrays in this document</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1 text-muted-foreground"
                onClick={collapseAll}
              >
                <ChevronsUpDown className="w-3 h-3" />
                <span className="hidden sm:inline">Collapse</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse nested values to save space</TooltipContent>
          </Tooltip>
          <div className="hidden sm:block w-px h-4 bg-border/60 mx-0.5" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy this document as JSON</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert a duplicate document (new _id)</TooltipContent>
          </Tooltip>
          {onOpenDocument && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenDocument}>
                  <FileJson className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open full JSON in editor modal (edit & save)</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${pinned ? "text-amber-500" : ""}`}
                onClick={onTogglePin}
              >
                <Pin className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pin to top of the list on this page</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className="relative bg-[hsl(220_16%_98%)] dark:bg-[hsl(222_24%_8%)]">
        <div
          className="absolute inset-y-0 left-0 w-2.5 sm:w-3 border-r border-border/30 bg-gradient-to-b from-muted/25 to-transparent pointer-events-none"
          aria-hidden
        />
        <div className="pl-4 sm:pl-5 pr-3 py-3 max-h-[min(70vh,520px)] overflow-auto w-full min-w-0">
          <div key={treeKey} className="font-mono text-[11px] leading-relaxed text-foreground w-full min-w-0">
            {doc !== null && typeof doc === "object" && !Array.isArray(doc) ? (
              <JsonDocumentRoot doc={doc} collapseFromDepth={collapseFromDepth} searchQuery={searchQuery} />
            ) : (
              <JsonNode data={doc} depth={0} collapseFromDepth={collapseFromDepth} searchQuery={searchQuery} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function DocumentsJsonView({
  docs,
  pinnedDocIds,
  onTogglePin,
  onCopy,
  onDuplicate,
  searchQuery = "",
  onOpenDocument,
  compareMode = false,
  compareDocs = [],
  onToggleCompare,
}: DocumentsJsonViewProps) {
  const { toast } = useToast();

  const copyDocumentId = useCallback(
    (id: string) => {
      void navigator.clipboard.writeText(id);
      toast({ title: "_id copied", description: id.length > 48 ? `${id.slice(0, 24)}…` : id });
    },
    [toast],
  );

  return (
    <div className="w-full min-w-0 space-y-4 px-3 py-3 md:px-4">
      <p className="text-[10px] text-muted-foreground px-0.5 flex flex-wrap items-center gap-2">
        <FileJson className="w-3.5 h-3.5 text-primary/70 shrink-0" />
        <span>
          <span className="text-foreground/80">Large screens:</span> fields split into two columns ·{" "}
          <span className="text-foreground/80">_id</span> click copies · nested values start collapsed · search highlights
          strings
          {compareMode && (
            <>
              {" "}
              · <span className="text-violet-400 font-medium">Compare</span> checkboxes on each card
            </>
          )}
        </span>
      </p>
      {docs.map((doc) => {
        const docId = String(doc._id ?? "");
        return (
          <DocumentJsonCard
            key={docId}
            doc={doc}
            docId={docId}
            pinned={pinnedDocIds.has(docId)}
            searchQuery={searchQuery}
            onTogglePin={() => onTogglePin(docId)}
            onCopy={() => onCopy(doc)}
            onDuplicate={() => onDuplicate(doc)}
            onOpenDocument={onOpenDocument ? () => onOpenDocument(doc) : undefined}
            compareMode={compareMode}
            compareDocs={compareDocs}
            onToggleCompare={onToggleCompare}
            onCopyDocumentId={copyDocumentId}
          />
        );
      })}
    </div>
  );
}
