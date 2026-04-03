import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Pin,
  Plus,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Calendar,
  Hash,
  Type,
  Code,
  Layers,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export interface DocumentsCardViewProps {
  docs: Record<string, unknown>[];
  visibleFields: string[];
  pinnedDocIds: Set<string>;
  onTogglePin: (docId: string) => void;
  onCopy: (doc: Record<string, unknown>) => void;
  onDuplicate: (doc: Record<string, unknown>) => void;
  onQuickFilter: (field: string, value: unknown) => void;
  onOpenDocument?: (doc: Record<string, unknown>) => void;
  compareMode?: boolean;
  compareDocs?: string[];
  onToggleCompare?: (docId: string, checked: boolean) => void;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"];

function isImageUrl(val: unknown): boolean {
  if (typeof val !== "string") return false;
  try {
    const url = new URL(val);
    const pathname = url.pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function getTypeIcon(val: unknown) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return <Hash className="w-2.5 h-2.5 opacity-50" />;
  if (typeof val === "boolean") return <CheckCircle2 className="w-2.5 h-2.5 opacity-50" />;
  if (typeof val === "string") {
    if (isImageUrl(val)) return <ImageIcon className="w-2.5 h-2.5 opacity-50" />;
    if (!isNaN(Date.parse(val)) && (val.includes("-") || val.includes("/")))
      return <Calendar className="w-2.5 h-2.5 opacity-50" />;
    return <Type className="w-2.5 h-2.5 opacity-50" />;
  }
  if (Array.isArray(val)) return <Layers className="w-2.5 h-2.5 opacity-50" />;
  if (typeof val === "object") return <Code className="w-2.5 h-2.5 opacity-50" />;
  return null;
}

const CardFieldValue = memo(function CardFieldValue({
  field,
  value,
  onQuickFilter,
}: {
  field: string;
  value: unknown;
  onQuickFilter: (field: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (value === undefined) return <span className="text-muted-foreground/40 italic">—</span>;
  if (value === null) return <span className="text-muted-foreground font-medium italic">null</span>;

  const isImg = isImageUrl(value);

  if (typeof value === "object") {
    const s = JSON.stringify(value);
    const isLong = s.length > 60;
    return (
      <div className="flex flex-col gap-1 w-full min-w-0">
        <button
          type="button"
          className="text-left font-mono text-[10px] break-all hover:bg-muted/40 rounded px-1 -ml-1 transition-colors group/val inline-flex items-start gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-blue-500/80 shrink-0">{Array.isArray(value) ? "[]" : "{}"}</span>
          <span className={expanded ? "whitespace-pre-wrap" : "truncate"}>
            {expanded ? JSON.stringify(value, null, 2) : isLong ? `${s.slice(0, 56)}…` : s}
          </span>
          {isLong && (
            <span className="shrink-0 pt-0.5 opacity-0 group-hover/val:opacity-100 transition-opacity">
              {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </span>
          )}
        </button>
      </div>
    );
  }

  const str = String(value);
  const isLong = str.length > 120 || /[\r\n]/.test(str);

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      <div className="flex items-start gap-1.5 group/val">
        <button
          type="button"
          className="text-left font-mono text-[11px] break-all hover:text-primary transition-colors flex-1 min-w-0"
          onClick={() => onQuickFilter(field, value)}
          title={`Filter by ${field}: ${str}`}
        >
          {isLong && !expanded ? (
            <span className="line-clamp-2">{str}</span>
          ) : (
            <span className="whitespace-pre-wrap">{str}</span>
          )}
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover/val:opacity-100 shrink-0 transition-opacity">
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted rounded text-muted-foreground"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onQuickFilter(field, value)}
                className="p-0.5 hover:bg-primary/10 hover:text-primary rounded text-muted-foreground"
              >
                <Search className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Apply filter: {field} = {str.slice(0, 20)}...</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {isImg && (
        <div className="mt-1 relative group/img max-w-full">
          <img
            src={str}
            alt={field}
            className="rounded border border-border/50 max-h-32 object-contain bg-muted/20 hover:scale-[1.02] transition-transform duration-300"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <a
            href={str}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-1 right-1 p-1 bg-background/80 backdrop-blur-sm rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-background"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
});

function DocumentCard({
  doc,
  visibleFields,
  pinned,
  onTogglePin,
  onCopy,
  onDuplicate,
  onQuickFilter,
  onOpenDocument,
  compareMode,
  compareDocs,
  onToggleCompare,
}: {
  doc: Record<string, unknown>;
  visibleFields: string[];
  pinned: boolean;
  onTogglePin: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onQuickFilter: (field: string, value: unknown) => void;
  onOpenDocument?: () => void;
  compareMode?: boolean;
  compareDocs?: string[];
  onToggleCompare?: (docId: string, checked: boolean) => void;
}) {
  const docId = String(doc._id || "");

  // "Best guess" for a title
  const titleField = useMemo(() => {
    const candidates = ["name", "title", "label", "username", "email", "full_name", "subject", "heading"];
    return candidates.find((c) => doc[c] && typeof doc[c] === "string") || null;
  }, [doc]);

  const titleValue = titleField ? String(doc[titleField]) : null;

  const inCompare = compareDocs?.includes(docId) ?? false;
  const compareDisabled = compareMode && (compareDocs?.length ?? 0) >= 2 && !inCompare;

  return (
    <article
      className={`group relative flex flex-col rounded-xl border bg-card p-4 transition-all duration-300 hover:shadow-lg hover:border-primary/30 ${
        pinned ? "border-amber-500/40 bg-amber-500/[0.02] ring-1 ring-amber-500/10" : "border-border/60"
      } ${inCompare ? "ring-1 ring-violet-500/40 border-violet-500/30 bg-violet-500/[0.01]" : ""}`}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          {titleValue ? (
            <h3 className="font-semibold text-sm truncate leading-tight text-foreground pr-2" title={titleValue}>
              {titleValue}
            </h3>
          ) : (
            <div className="h-5 flex items-center">
               <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60 leading-none">Document</span>
            </div>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(docId);
            }}
            className="mt-1 font-mono text-[9px] text-muted-foreground/70 hover:text-primary transition-colors block truncate w-full text-left"
            title={`_id: ${docId} (click to copy)`}
          >
            {docId}
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {compareMode && (
             <input
                type="checkbox"
                className="mr-1.5 rounded accent-violet-500 w-3.5 h-3.5"
                checked={inCompare}
                disabled={compareDisabled}
                onChange={(e) => onToggleCompare?.(docId, e.target.checked)}
             />
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-20 group-hover:opacity-100 transition-opacity"
                onClick={onCopy}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy JSON</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-20 group-hover:opacity-100 transition-opacity"
                onClick={onTogglePin}
              >
                <Pin className={`w-3.5 h-3.5 ${pinned ? "text-amber-500 fill-amber-500/20" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? "Unpin" : "Pin to top"}</TooltipContent>
          </Tooltip>

          {onOpenDocument && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-20 group-hover:opacity-100 transition-opacity"
                  onClick={onOpenDocument}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in Editor</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-2.5 overflow-hidden">
        {visibleFields
          .filter((f) => f !== "_id" && f !== titleField)
          .map((f) => (
            <div key={f} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-tighter truncate max-w-[120px]" title={f}>
                  {f}
                </span>
                {getTypeIcon(doc[f])}
              </div>
              <CardFieldValue field={f} value={doc[f]} onQuickFilter={onQuickFilter} />
            </div>
          ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
        <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-normal text-muted-foreground/70 bg-muted/20">
          {Object.keys(doc).length} fields
        </Badge>
        <div className="flex items-center gap-1">
           <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] font-medium text-primary hover:bg-primary/5"
            onClick={onDuplicate}
           >
              <Plus className="w-2.5 h-2.5 mr-1" /> Duplicate
           </Button>
        </div>
      </div>
    </article>
  );
}

export function DocumentsCardView({
  docs,
  visibleFields,
  pinnedDocIds,
  onTogglePin,
  onCopy,
  onDuplicate,
  onQuickFilter,
  onOpenDocument,
  compareMode,
  compareDocs,
  onToggleCompare,
}: DocumentsCardViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 p-4">
      {docs.map((doc) => {
        const id = String(doc._id || "");
        return (
          <DocumentCard
            key={id}
            doc={doc}
            visibleFields={visibleFields}
            pinned={pinnedDocIds.has(id)}
            onTogglePin={() => onTogglePin(id)}
            onCopy={() => onCopy(doc)}
            onDuplicate={() => onDuplicate(doc)}
            onQuickFilter={onQuickFilter}
            onOpenDocument={onOpenDocument ? () => onOpenDocument(doc) : undefined}
            compareMode={compareMode}
            compareDocs={compareDocs}
            onToggleCompare={onToggleCompare}
          />
        );
      })}
    </div>
  );
}
