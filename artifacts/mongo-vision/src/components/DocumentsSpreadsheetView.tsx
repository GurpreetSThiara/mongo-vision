import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Snowflake,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SpreadsheetLayoutPrefs } from "@/lib/docExplorerPrefs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatSpreadsheetCellValue(raw: unknown): string {
  if (raw === null) return "null";
  if (raw === undefined) return "";
  if (raw instanceof Date) return raw.toISOString();
  const t = typeof raw;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return String(raw);
  if (t === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

/** Object or array (not null) — show cell modal on click. */
function isCollectionLike(raw: unknown): boolean {
  return raw !== null && typeof raw === "object";
}

export interface SpreadsheetHandlers {
  onOpenFullDocument: (doc: Record<string, unknown>) => void;
  onCopy: (doc: Record<string, unknown>) => void;
  onDuplicate: (doc: Record<string, unknown>) => void;
  onPin: (docId: string) => void;
  isPinned: (docId: string) => boolean;
  onEdit: (docId: string, doc: Record<string, unknown>) => void;
  onDelete: (docId: string) => void;
  compareMode: boolean;
  compareDocs: string[];
  onToggleCompare: (docId: string, checked: boolean) => void;
  selectedDocs: Set<string>;
  onToggleSelect: (docId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean, docIds: string[]) => void;
  inlineEditCell: { docId: string; field: string; value: string } | null;
  onInlineEdit: (
    docId: string,
    field: string,
    newValue: string,
    previousValue: string,
  ) => Promise<boolean>;
  setInlineEditCell: (v: { docId: string; field: string; value: string } | null) => void;
  onReorderFields: (fields: string[]) => void;
}

interface DocumentsSpreadsheetViewProps {
  docs: Record<string, unknown>[];
  visibleFields: string[];
  layout: SpreadsheetLayoutPrefs;
  onLayoutChange: (next: SpreadsheetLayoutPrefs) => void;
  handlers: SpreadsheetHandlers;
  fieldTypes?: Record<string, string>;
}

const MIN_COL = 80;
const MAX_COL = 640;
const MIN_ROW = 28;
const MAX_ROW = 200;
const STICKY_LEFT_W = 40;
const CELL_CLICK_DELAY_MS = 280;

export function DocumentsSpreadsheetView({
  docs,
  visibleFields,
  layout,
  onLayoutChange,
  handlers,
  fieldTypes,
}: DocumentsSpreadsheetViewProps) {
  const colResizeRef = useRef<{ field: string; startX: number; startW: number } | null>(null);
  const rowResizeRef = useRef<{ docId: string; startY: number; startH: number } | null>(null);
  const cellClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [resizingRow, setResizingRow] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const toggleCellExpand = useCallback((docId: string, field: string) => {
    setExpandedCells((prev) => {
      const n = new Set(prev);
      const key = `${docId}-${field}`;
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (handlers.inlineEditCell) {
      return;
    }

    if (!focusedCell) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key)) {
        e.preventDefault();
        setFocusedCell({ rowIndex: 0, colIndex: 0 });
      }
      return;
    }

    const maxRow = docs.length - 1;
    const maxCol = visibleFields.length - 1;
    let { rowIndex, colIndex } = focusedCell;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        rowIndex = Math.max(0, rowIndex - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        rowIndex = Math.min(maxRow, rowIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        colIndex = Math.max(0, colIndex - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        colIndex = Math.min(maxCol, colIndex + 1);
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          colIndex = colIndex - 1;
          if (colIndex < 0) {
            colIndex = maxCol;
            rowIndex = Math.max(0, rowIndex - 1);
          }
        } else {
          colIndex = colIndex + 1;
          if (colIndex > maxCol) {
            colIndex = 0;
            rowIndex = Math.min(maxRow, rowIndex + 1);
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        const doc = docs[rowIndex];
        const field = visibleFields[colIndex];
        if (field === "_id") return;
        const raw = doc[field];
        handlers.setInlineEditCell({
          docId: String(doc._id),
          field,
          value: raw !== null && typeof raw === "object"
            ? JSON.stringify(raw, null, 2)
            : String(raw ?? ""),
        });
        break;
      default:
        return;
    }

    setFocusedCell({ rowIndex, colIndex });
  }, [focusedCell, docs, visibleFields, handlers]);
  const [cellDetailModal, setCellDetailModal] = useState<{
    docId: string;
    field: string;
    initialText: string;
  } | null>(null);
  const [modalDraft, setModalDraft] = useState("");
  const [modalSavePending, setModalSavePending] = useState(false);

  const frozenSet = useMemo(() => new Set(layout.frozenFields ?? []), [layout.frozenFields]);
  const frozenFields = useMemo(
    () => visibleFields.filter((f) => frozenSet.has(f)),
    [visibleFields, frozenSet],
  );
  const scrollFields = useMemo(
    () => visibleFields.filter((f) => !frozenSet.has(f)),
    [visibleFields, frozenSet],
  );

  useEffect(() => {
    if (cellDetailModal) setModalDraft(cellDetailModal.initialText);
  }, [cellDetailModal]);

  useEffect(() => {
    return () => {
      if (cellClickTimerRef.current) clearTimeout(cellClickTimerRef.current);
    };
  }, []);

  const toggleFreezeField = useCallback(
    (field: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const next = new Set(layout.frozenFields ?? []);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      const ordered = visibleFields.filter((f) => next.has(f));
      onLayoutChange({ ...layout, frozenFields: ordered });
    },
    [layout, onLayoutChange, visibleFields],
  );

  const scheduleCellModal = useCallback((docId: string, field: string, raw: unknown) => {
    if (!isCollectionLike(raw)) return;
    if (cellClickTimerRef.current) clearTimeout(cellClickTimerRef.current);
    cellClickTimerRef.current = setTimeout(() => {
      cellClickTimerRef.current = null;
      const initialText = formatSpreadsheetCellValue(raw);
      setCellDetailModal({ docId, field, initialText });
    }, CELL_CLICK_DELAY_MS);
  }, []);

  const cancelCellModalOpen = useCallback(() => {
    if (cellClickTimerRef.current) {
      clearTimeout(cellClickTimerRef.current);
      cellClickTimerRef.current = null;
    }
  }, []);

  const colWidth = useCallback(
    (f: string) => layout.colWidths[f] ?? layout.defaultColWidth,
    [layout],
  );

  const scrollTotalWidth = useMemo(
    () => scrollFields.reduce((s, f) => s + colWidth(f), 0),
    [scrollFields, colWidth],
  );

  const onColResizeMove = useCallback(
    (e: MouseEvent) => {
      const r = colResizeRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const w = Math.min(MAX_COL, Math.max(MIN_COL, r.startW + dx));
      onLayoutChange({
        ...layout,
        colWidths: { ...layout.colWidths, [r.field]: w },
      });
    },
    [layout, onLayoutChange],
  );

  const onColResizeUp = useCallback(() => {
    colResizeRef.current = null;
    setResizingCol(null);
    window.removeEventListener("mousemove", onColResizeMove);
    window.removeEventListener("mouseup", onColResizeUp);
  }, [onColResizeMove]);

  const startColResize = useCallback(
    (field: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      colResizeRef.current = { field, startX: e.clientX, startW: colWidth(field) };
      setResizingCol(field);
      window.addEventListener("mousemove", onColResizeMove);
      window.addEventListener("mouseup", onColResizeUp);
    },
    [colWidth, onColResizeMove, onColResizeUp],
  );

  const onRowResizeMove = useCallback(
    (e: MouseEvent) => {
      const r = rowResizeRef.current;
      if (!r) return;
      const dy = e.clientY - r.startY;
      const h = Math.min(MAX_ROW, Math.max(MIN_ROW, r.startH + dy));
      onLayoutChange({ ...layout, rowHeight: h });
    },
    [layout, onLayoutChange],
  );

  const onRowResizeUp = useCallback(() => {
    rowResizeRef.current = null;
    setResizingRow(null);
    window.removeEventListener("mousemove", onRowResizeMove);
    window.removeEventListener("mouseup", onRowResizeUp);
  }, [onRowResizeMove]);

  const startRowResize = useCallback(
    (docId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      rowResizeRef.current = { docId, startY: e.clientY, startH: layout.rowHeight };
      setResizingRow(docId);
      window.addEventListener("mousemove", onRowResizeMove);
      window.addEventListener("mouseup", onRowResizeUp);
    },
    [layout.rowHeight, onRowResizeMove, onRowResizeUp],
  );

  const onColResizeTouchMove = useCallback(
    (e: TouchEvent) => {
      const r = colResizeRef.current;
      if (!r || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - r.startX;
      const w = Math.min(MAX_COL, Math.max(MIN_COL, r.startW + dx));
      onLayoutChange({
        ...layout,
        colWidths: { ...layout.colWidths, [r.field]: w },
      });
    },
    [layout, onLayoutChange],
  );

  const onColResizeTouchEnd = useCallback(() => {
    colResizeRef.current = null;
    setResizingCol(null);
    window.removeEventListener("touchmove", onColResizeTouchMove);
    window.removeEventListener("touchend", onColResizeTouchEnd);
  }, [onColResizeTouchMove]);

  const startColResizeTouch = useCallback(
    (field: string, e: React.TouchEvent) => {
      if (e.touches.length === 0) return;
      e.stopPropagation();
      const touch = e.touches[0];
      colResizeRef.current = { field, startX: touch.clientX, startW: colWidth(field) };
      setResizingCol(field);
      window.addEventListener("touchmove", onColResizeTouchMove, { passive: false });
      window.addEventListener("touchend", onColResizeTouchEnd);
    },
    [colWidth, onColResizeTouchMove, onColResizeTouchEnd],
  );

  const onRowResizeTouchMove = useCallback(
    (e: TouchEvent) => {
      const r = rowResizeRef.current;
      if (!r || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dy = touch.clientY - r.startY;
      const h = Math.min(MAX_ROW, Math.max(MIN_ROW, r.startH + dy));
      onLayoutChange({ ...layout, rowHeight: h });
    },
    [layout, onLayoutChange],
  );

  const onRowResizeTouchEnd = useCallback(() => {
    rowResizeRef.current = null;
    setResizingRow(null);
    window.removeEventListener("touchmove", onRowResizeTouchMove);
    window.removeEventListener("touchend", onRowResizeTouchEnd);
  }, [onRowResizeTouchMove]);

  const startRowResizeTouch = useCallback(
    (docId: string, e: React.TouchEvent) => {
      if (e.touches.length === 0) return;
      e.stopPropagation();
      const touch = e.touches[0];
      rowResizeRef.current = { docId, startY: touch.clientY, startH: layout.rowHeight };
      setResizingRow(docId);
      window.addEventListener("touchmove", onRowResizeTouchMove, { passive: false });
      window.addEventListener("touchend", onRowResizeTouchEnd);
    },
    [layout.rowHeight, onRowResizeTouchMove, onRowResizeTouchEnd],
  );

  const applyWidthToAllColumns = useCallback(() => {
    if (visibleFields.length === 0) return;
    const w = visibleFields.reduce((acc, f) => acc + colWidth(f), 0) / visibleFields.length;
    const rounded = Math.round(Math.min(MAX_COL, Math.max(MIN_COL, w)));
    const next: Record<string, number> = {};
    visibleFields.forEach((f) => {
      next[f] = rounded;
    });
    onLayoutChange({ ...layout, colWidths: { ...layout.colWidths, ...next }, defaultColWidth: rounded });
  }, [visibleFields, colWidth, layout, onLayoutChange]);

  const headerH = layout.rowHeight + 8;

  const getTypeBadge = (field: string) => {
    if (field === "_id") return { label: "id", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
    const type = fieldTypes?.[field]?.toLowerCase() || "";
    switch (type) {
      case "string":
        return { label: "abc", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
      case "number":
      case "double":
      case "int":
      case "long":
      case "decimal":
        return { label: "#", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
      case "boolean":
        return { label: "t/f", color: "bg-violet-500/10 text-violet-400 border-violet-500/20" };
      case "object":
        return { label: "{}", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      case "array":
        return { label: "[]", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
      case "objectid":
        return { label: "oid", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
      case "date":
        return { label: "date", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" };
      case "null":
        return { label: "null", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
      default:
        return null;
    }
  };

  const renderColumnHeader = (f: string) => {
    const isFrozen = frozenSet.has(f);
    const b = getTypeBadge(f);
    return (
      <div
        key={f}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", f);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedField = e.dataTransfer.getData("text/plain");
          if (draggedField && draggedField !== f) {
            const nextFields = [...visibleFields];
            const dragIdx = nextFields.indexOf(draggedField);
            const dropIdx = nextFields.indexOf(f);
            if (dragIdx !== -1 && dropIdx !== -1) {
              nextFields.splice(dragIdx, 1);
              nextFields.splice(dropIdx, 0, draggedField);
              handlers.onReorderFields(nextFields);
            }
          }
        }}
        className="relative shrink-0 px-1 py-2 font-mono font-medium text-muted-foreground border-r border-border/50 flex items-center gap-0.5 bg-muted/40 cursor-grab active:cursor-grabbing select-none"
        style={{ width: colWidth(f), minWidth: colWidth(f) }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`shrink-0 rounded p-0.5 hover:bg-muted ${isFrozen ? "text-sky-400" : "text-muted-foreground/60"}`}
              aria-label={isFrozen ? "Unfreeze column" : "Freeze column"}
              onClick={(e) => toggleFreezeField(f, e)}
            >
              <Snowflake className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isFrozen ? "Unfreeze column" : "Freeze column (stays visible when scrolling)"}
          </TooltipContent>
        </Tooltip>
        <span className="truncate flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate">{f}</span>
          {b && (
            <span className={`text-[8px] font-mono px-1 py-0.2 rounded border uppercase font-bold tracking-tight shrink-0 scale-90 ${b.color}`}>
              {b.label}
            </span>
          )}
        </span>
        <button
          type="button"
          className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 ${
            resizingCol === f ? "bg-primary/60" : ""
          }`}
          aria-label={`Resize ${f}`}
          onMouseDown={(e) => startColResize(f, e)}
          onTouchStart={(e) => startColResizeTouch(f, e)}
        />
      </div>
    );
  };

  const renderInlineTree = (val: unknown): React.ReactNode => {
    if (val === null) return <span className="text-muted-foreground font-bold">null</span>;
    if (val === undefined) return <span className="text-muted-foreground/50">undefined</span>;
    if (typeof val !== "object" || val instanceof Date) {
      if (typeof val === "string") return <span className="text-emerald-400 font-medium">"{val}"</span>;
      if (typeof val === "number") return <span className="text-amber-400 font-medium">{val}</span>;
      if (typeof val === "boolean") return <span className="text-violet-500 font-medium">{String(val)}</span>;
      return <span>{String(val)}</span>;
    }

    const isArr = Array.isArray(val);
    const entries = isArr
      ? (val as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(val as Record<string, unknown>);

    if (entries.length === 0) {
      return <span className="text-muted-foreground font-semibold">{isArr ? "[]" : "{}"}</span>;
    }

    return (
      <div className="font-mono text-[10px] pl-2 border-l border-border/30 my-0.5 space-y-0.5 select-text">
        {entries.map(([key, subVal]) => (
          <div key={key} className="flex items-start gap-1 flex-wrap">
            <span className="text-muted-foreground/80 shrink-0">{key}:</span>
            {renderInlineTree(subVal)}
          </div>
        ))}
      </div>
    );
  };

  const renderDataCell = (
    doc: Record<string, unknown>,
    docId: string,
    f: string,
    rowIndex: number,
    colIndex: number
  ) => {
    const raw = doc[f];
    const display =
      raw === undefined ? "—" : raw === null ? "null" : formatSpreadsheetCellValue(raw);
    const prevVal = handlers.inlineEditCell?.value ?? "";
    const isFocused = focusedCell?.rowIndex === rowIndex && focusedCell?.colIndex === colIndex;
    const isSelected = handlers.selectedDocs.has(docId);
    const isColl = raw !== null && typeof raw === "object" && !(raw instanceof Date);
    const cellKey = `${docId}-${f}`;
    const isExpanded = expandedCells.has(cellKey);

    return (
      <div
        key={`${docId}-${f}`}
        className={`shrink-0 px-1 py-0.5 font-mono border-r border-border/40 flex min-h-0 items-stretch ${
          isSelected ? "bg-primary/[0.04] dark:bg-primary/[0.08]" : "bg-card/30"
        } ${isFocused ? "ring-2 ring-primary bg-primary/10 border-primary" : ""}`}
        style={{
          width: colWidth(f),
          minWidth: colWidth(f),
          height: layout.rowHeight,
          maxHeight: layout.rowHeight,
        }}
        onClick={() => {
          setFocusedCell({ rowIndex, colIndex });
        }}
      >
        {handlers.inlineEditCell?.docId === docId && handlers.inlineEditCell?.field === f ? (
          <textarea
            autoFocus
            defaultValue={handlers.inlineEditCell.value}
            className="text-[11px] font-mono w-full min-h-0 flex-1 resize-none bg-muted/50 border border-primary rounded px-1 py-0.5 outline-none overflow-auto leading-snug scrollbar-invisible"
            onBlur={(e) => void handlers.onInlineEdit(docId, f, e.target.value, prevVal)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                handlers.setInlineEditCell(null);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handlers.onInlineEdit(
                  docId,
                  f,
                  (e.target as HTMLTextAreaElement).value,
                  prevVal,
                );
              }
            }}
            spellCheck={false}
          />
        ) : isColl ? (
          isExpanded ? (
            <div className="flex flex-col gap-1 w-full h-full overflow-y-auto pr-1 scrollbar-invisible select-none">
              <div className="flex items-center justify-between shrink-0">
                <Badge
                  variant="outline"
                  className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 gap-1 text-[9px] h-4 py-0 px-1 font-mono shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCellExpand(docId, f);
                  }}
                >
                  <span>{Array.isArray(raw) ? "Array" : "Object"}</span>
                  <ChevronUp className="w-2.5 h-2.5" />
                </Badge>
                <button
                  type="button"
                  className="text-[9px] text-muted-foreground/70 hover:text-foreground hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    scheduleCellModal(docId, f, raw);
                  }}
                >
                  Modal
                </button>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {renderInlineTree(raw)}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-start w-full h-full min-h-0 select-none">
              {Array.isArray(raw) ? (
                <Badge
                  variant="outline"
                  className="cursor-pointer bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20 gap-1.5 text-[10px] h-5 py-0 px-2 font-mono shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCellExpand(docId, f);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    scheduleCellModal(docId, f, raw);
                  }}
                >
                  <span>[{raw.length}] Array</span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="cursor-pointer bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20 gap-1.5 text-[10px] h-5 py-0 px-2 font-mono shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCellExpand(docId, f);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    scheduleCellModal(docId, f, raw);
                  }}
                >
                  <span>{'{' + Object.keys(raw).length + '}'} Fields</span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </Badge>
              )}
            </div>
          )
        ) : (
          <button
            type="button"
            className="text-left w-full min-h-0 min-w-0 overflow-auto text-[11px] leading-snug whitespace-pre-wrap break-all text-foreground rounded px-0.5 py-0.5 border border-transparent transition-colors scrollbar-invisible cursor-default hover:bg-muted/20"
            title="Double-click: inline edit · scroll inside cell (no bar)"
            onClick={() => {
              scheduleCellModal(docId, f, raw);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              cancelCellModalOpen();
              if (f === "_id") return;
              handlers.setInlineEditCell({
                docId,
                field: f,
                value:
                  raw !== null && typeof raw === "object"
                    ? JSON.stringify(raw, null, 2)
                    : String(raw ?? ""),
              });
            }}
          >
            {raw === undefined ? (
              <span className="text-muted-foreground/50">—</span>
            ) : raw === null ? (
              <span className="text-muted-foreground">null</span>
            ) : (
              display
            )}
          </button>
        )}
      </div>
    );
  };

  const handleModalSave = async () => {
    if (!cellDetailModal) return;
    setModalSavePending(true);
    try {
      const ok = await handlers.onInlineEdit(
        cellDetailModal.docId,
        cellDetailModal.field,
        modalDraft,
        cellDetailModal.initialText,
      );
      if (ok) setCellDetailModal(null);
    } finally {
      setModalSavePending(false);
    }
  };

  return (
    <div
      className="flex flex-col border-t border-border text-xs focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={() => setFocusedCell(null)}
    >
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border/50 bg-muted/20 text-[10px] text-muted-foreground shrink-0 flex-wrap">
        <span>Spreadsheet</span>
        <Button variant="outline" size="sm" className="h-6 text-[9px]" type="button" onClick={applyWidthToAllColumns}>
          Same column width
        </Button>
        <span className="text-[9px]">
          Snowflake: freeze column · one horizontal scrollbar at bottom for all non-frozen columns · in-cell scroll has
          no bar · double-click to edit · object/array: click opens modal
        </span>
      </div>

      <Dialog
        open={!!cellDetailModal}
        onOpenChange={(o) => {
          if (!o) setCellDetailModal(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm truncate pr-8">
              {cellDetailModal ? `${cellDetailModal.field}` : ""}
              <span className="block text-[10px] font-sans font-normal text-muted-foreground mt-1 truncate">
                {cellDetailModal ? `Document ${cellDetailModal.docId}` : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[200px] max-h-[55vh] w-full rounded-md border border-border bg-muted/20 p-3 text-[11px] font-mono leading-snug text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring scrollbar-invisible overflow-auto resize-y"
            value={modalDraft}
            onChange={(e) => setModalDraft(e.target.value)}
            spellCheck={false}
            aria-label="Field value (JSON)"
          />
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                if (modalDraft) void navigator.clipboard.writeText(modalDraft);
              }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCellDetailModal(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={modalSavePending}
              onClick={() => void handleModalSave()}
            >
              {modalSavePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative flex min-w-0" style={{ minHeight: 120 }}>
        {/* Fixed checkbox column */}
        <div
          className="shrink-0 border-r border-border bg-card z-30 flex flex-col"
          style={{ width: STICKY_LEFT_W }}
        >
          <div
            className="flex items-center justify-center border-b border-border bg-muted/40 font-medium text-muted-foreground shrink-0"
            style={{ height: headerH }}
          >
            <input
              type="checkbox"
              className="rounded"
              checked={docs.length > 0 && handlers.selectedDocs.size === docs.length}
              onChange={(e) =>
                handlers.onSelectAll(
                  e.target.checked,
                  docs.map((d) => String(d._id)),
                )
              }
            />
          </div>
          {docs.map((doc) => {
            const docId = String(doc._id || "");
            const pin = handlers.isPinned(docId);
            const isSelected = handlers.selectedDocs.has(docId);
            const rowClass = pin
              ? "bg-amber-500/5 border-l-2 border-l-amber-500"
              : isSelected
                ? "bg-primary/10 border-l-2 border-l-primary"
                : "bg-card";
            return (
              <div
                key={docId}
                className={`relative flex items-center justify-center border-b border-border/60 shrink-0 ${rowClass}`}
                style={{ height: layout.rowHeight, minHeight: layout.rowHeight }}
              >
                {handlers.compareMode ? (
                  <input
                    type="checkbox"
                    className="rounded accent-violet-500"
                    checked={handlers.compareDocs.includes(docId)}
                    disabled={handlers.compareDocs.length >= 2 && !handlers.compareDocs.includes(docId)}
                    onChange={(e) => handlers.onToggleCompare(docId, e.target.checked)}
                  />
                ) : (
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={handlers.selectedDocs.has(docId)}
                    onChange={(e) => handlers.onToggleSelect(docId, e.target.checked)}
                  />
                )}
                <button
                  type="button"
                  className={`absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/40 ${
                    resizingRow === docId ? "bg-primary/50" : ""
                  }`}
                  title="Resize row height (all rows)"
                  aria-label="Resize row height for all rows"
                  onMouseDown={(e) => startRowResize(docId, e)}
                  onTouchStart={(e) => startRowResizeTouch(docId, e)}
                />
              </div>
            );
          })}
        </div>

        {/* Data: frozen strip (no h-scroll) + one shared horizontal scroll (visible bar at bottom) */}
        <div className="flex flex-1 min-w-0 min-h-0 border-r border-border z-20">
          {frozenFields.length > 0 && (
            <div
              className="shrink-0 flex flex-col border-r border-border bg-card shadow-[4px_0_12px_rgba(0,0,0,0.08)] z-10"
              style={{
                width: frozenFields.reduce((s, f) => s + colWidth(f), 0),
              }}
            >
              <div className="flex shrink-0 border-b border-border bg-muted/40" style={{ height: headerH }}>
                {frozenFields.map((f) => renderColumnHeader(f))}
              </div>
              {docs.map((doc, rowIndex) => {
                const docId = String(doc._id || "");
                const pin = handlers.isPinned(docId);
                const isSelected = handlers.selectedDocs.has(docId);
                const rowBg = pin
                  ? "bg-amber-500/2"
                  : isSelected
                    ? "bg-primary/[0.04]"
                    : "";
                return (
                  <div
                    key={docId}
                    className={`flex shrink-0 border-b border-border/60 ${rowBg}`}
                    style={{ height: layout.rowHeight, minHeight: layout.rowHeight }}
                  >
                    {frozenFields.map((f) => {
                      const colIndex = visibleFields.indexOf(f);
                      return renderDataCell(doc, docId, f, rowIndex, colIndex);
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Single overflow-x for all non-frozen columns — standard visible scrollbar */}
          <div className="flex-1 min-w-0 overflow-x-auto min-h-0">
            <div
              className="flex flex-col"
              style={{
                width: Math.max(scrollTotalWidth, 1),
                minWidth: Math.max(scrollTotalWidth, 1),
              }}
            >
              <div className="flex shrink-0 border-b border-border bg-muted/40" style={{ height: headerH }}>
                {(scrollFields.length === 0 && frozenFields.length === 0 ? visibleFields : scrollFields).map(
                  (f) => renderColumnHeader(f),
                )}
              </div>
              {docs.map((doc, rowIndex) => {
                const docId = String(doc._id || "");
                const pin = handlers.isPinned(docId);
                const isSelected = handlers.selectedDocs.has(docId);
                const rowBg = pin
                  ? "bg-amber-500/2"
                  : isSelected
                    ? "bg-primary/[0.04]"
                    : "";
                const fieldsForRow =
                  scrollFields.length === 0 && frozenFields.length === 0 ? visibleFields : scrollFields;
                return (
                  <div key={docId} className="shrink-0">
                    <div
                      className={`flex border-b border-border/60 hover:bg-muted/10 ${rowBg}`}
                      style={{ height: layout.rowHeight, minHeight: layout.rowHeight }}
                    >
                      {fieldsForRow.map((f) => {
                        const colIndex = visibleFields.indexOf(f);
                        return renderDataCell(doc, docId, f, rowIndex, colIndex);
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fixed actions */}
        <div
          className="shrink-0 border-l border-border bg-card z-30 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.15)]"
          style={{ width: 148 }}
        >
          <div
            className="flex items-center justify-end px-1 border-b border-border bg-muted/40 text-[9px] text-muted-foreground shrink-0"
            style={{ height: headerH }}
          >
            Actions
          </div>
          {docs.map((doc) => {
            const docId = String(doc._id || "");
            const isPinned = handlers.isPinned(docId);
            const isSelected = handlers.selectedDocs.has(docId);
            return (
              <div
                key={docId}
                className={`flex items-center justify-end gap-0.5 px-1 border-b border-border/60 shrink-0 ${
                  isSelected ? "bg-primary/[0.04] dark:bg-primary/[0.08]" : ""
                }`}
                style={{ height: layout.rowHeight, minHeight: layout.rowHeight }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      type="button"
                      aria-label="Edit document"
                      onClick={() => handlers.onOpenFullDocument(doc)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Edit document (JSON)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      type="button"
                      aria-label="Copy JSON"
                      onClick={() => handlers.onCopy(doc)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Copy document JSON</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      type="button"
                      aria-label="Duplicate"
                      onClick={() => handlers.onDuplicate(doc)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Duplicate document</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-6 w-6 p-0 ${isPinned ? "text-amber-400" : ""}`}
                      type="button"
                      aria-label={isPinned ? "Unpin" : "Pin"}
                      onClick={() => handlers.onPin(docId)}
                    >
                      <Pin className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {isPinned ? "Unpin from top" : "Pin to top"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      type="button"
                      aria-label="Delete"
                      onClick={() => handlers.onDelete(docId)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete document</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
