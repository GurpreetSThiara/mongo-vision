import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock, Search, Trash2, Pin, PinOff, Play, X, RotateCcw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueryHistoryEntry {
  id: string;
  query: string;
  type: "find" | "aggregate";
  collection: string;
  database: string;
  executionTimeMs: number;
  resultCount: number;
  timestamp: number;
  pinned?: boolean;
}

interface QueryHistoryProps {
  database: string;
  collection: string;
  onSelect: (entry: QueryHistoryEntry) => void;
  onClose: () => void;
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

const STORAGE_KEY = "mongo-vision-query-history";
const MAX_ENTRIES = 50;

function loadHistory(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: QueryHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function addToHistory(entry: Omit<QueryHistoryEntry, "id" | "timestamp">) {
  const history = loadHistory();
  const newEntry: QueryHistoryEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
  };
  // Deduplicate: remove exact same query for same collection
  const filtered = history.filter(
    h => !(h.query === entry.query && h.collection === entry.collection && h.database === entry.database && !h.pinned)
  );
  filtered.unshift(newEntry);
  saveHistory(filtered);
}

export function clearHistory() {
  const history = loadHistory();
  saveHistory(history.filter(h => h.pinned));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QueryHistory({ database, collection, onSelect, onClose }: QueryHistoryProps) {
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterScope, setFilterScope] = useState<"collection" | "all">("collection");

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const filtered = useMemo(() => {
    let items = history;
    if (filterScope === "collection") {
      items = items.filter(h => h.collection === collection && h.database === database);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      items = items.filter(h => h.query.toLowerCase().includes(lower));
    }
    // Pinned first, then by timestamp
    return items.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });
  }, [history, searchTerm, filterScope, collection, database]);

  const togglePin = (id: string) => {
    setHistory(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h);
      saveHistory(updated);
      return updated;
    });
  };

  const removeEntry = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveHistory(updated);
      return updated;
    });
  };

  const handleClearAll = () => {
    const pinned = history.filter(h => h.pinned);
    saveHistory(pinned);
    setHistory(pinned);
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Query History</span>
          <Badge variant="outline" className="text-[10px] h-4">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleClearAll} title="Clear unpinned">
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose} title="Close">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Search & Scope */}
      <div className="px-3 py-2 border-b border-border space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search queries..."
            className="h-7 text-xs pl-7"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={filterScope === "collection" ? "default" : "ghost"}
            size="sm" className="h-5 text-[10px] px-2"
            onClick={() => setFilterScope("collection")}
          >
            This Collection
          </Button>
          <Button
            variant={filterScope === "all" ? "default" : "ghost"}
            size="sm" className="h-5 text-[10px] px-2"
            onClick={() => setFilterScope("all")}
          >
            All
          </Button>
        </div>
      </div>

      {/* Entries */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-8">
              <RotateCcw className="w-6 h-6 mx-auto mb-2 opacity-30" />
              No queries yet
            </div>
          )}
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="group relative p-2 rounded-md hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-colors"
              onClick={() => onSelect(entry)}
            >
              {/* Pin indicator */}
              {entry.pinned && (
                <Pin className="absolute top-1 right-1 w-2.5 h-2.5 text-amber-400" />
              )}

              {/* Query preview */}
              <div className="font-mono text-[11px] text-foreground/90 truncate pr-6 leading-relaxed">
                {entry.query.length > 80 ? entry.query.slice(0, 80) + "…" : entry.query}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={`text-[9px] h-3.5 px-1 ${entry.type === "aggregate" ? "border-violet-500/40 text-violet-400" : "border-blue-500/40 text-blue-400"}`}
                >
                  {entry.type}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{entry.executionTimeMs}ms</span>
                <span className="text-[10px] text-muted-foreground">•</span>
                <span className="text-[10px] text-muted-foreground">{entry.resultCount} docs</span>
                {filterScope === "all" && (
                  <>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{entry.collection}</span>
                  </>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">{formatTime(entry.timestamp)}</span>
              </div>

              {/* Actions on hover */}
              <div className="absolute top-1 right-5 hidden group-hover:flex gap-0.5">
                <Button
                  variant="ghost" size="icon" className="h-4 w-4"
                  onClick={(e) => { e.stopPropagation(); togglePin(entry.id); }}
                  title={entry.pinned ? "Unpin" : "Pin"}
                >
                  {entry.pinned ? <PinOff className="w-2.5 h-2.5" /> : <Pin className="w-2.5 h-2.5" />}
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-4 w-4 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                  title="Remove"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
