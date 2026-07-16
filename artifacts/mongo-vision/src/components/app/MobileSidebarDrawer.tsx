/**
 * MobileSidebarDrawer
 *
 * Slide-in overlay drawer for mobile navigation.
 * Shows the full database/collection tree, triggered by the hamburger icon.
 *
 * App-UI component — visible only on mobile (< 768px).
 */
import { useEffect } from "react";
import { Link } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X, Database, ChevronRight, ChevronDown, Layers, Plus, Trash2,
  BookmarkCheck, Star, ArrowLeft,
} from "lucide-react";
import { APP_NAME } from "@/constants";
import { LABEL } from "@/constants/messages";

interface DbEntry { name: string; collectionCount?: number }
interface ColEntry { name: string }

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  database: string;
  collection: string;
  expandedDbs: Set<string>;
  onToggleDb: (dbName: string) => void;
  onSelectDb: (dbName: string) => void;
  onSelectCollection: (db: string, col: string) => void;
  onDropDb: (dbName: string) => void;
  onDropCollection: (db: string, col: string) => void;
  onCreateCollection: () => void;
  databases?: DbEntry[];
  collections?: ColEntry[];
  dbsLoading?: boolean;
  colsLoading?: boolean;
  savedQueries?: { id: string; name: string; query: any }[];
  onSelectSavedQuery: (q: any) => void;
  onDeleteSavedQuery: (id: string) => void;
}

export function MobileSidebarDrawer({
  open,
  onClose,
  connectionId,
  database,
  collection,
  expandedDbs,
  onToggleDb,
  onSelectDb,
  onSelectCollection,
  onDropDb,
  onDropCollection,
  onCreateCollection,
  databases = [],
  collections = [],
  dbsLoading,
  colsLoading,
  savedQueries = [],
  onSelectSavedQuery,
  onDeleteSavedQuery,
}: MobileSidebarDrawerProps) {
  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-sidebar flex flex-col shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-2 shrink-0">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-bold font-mono text-sm flex-1">{APP_NAME}</span>
          <div className="flex items-center gap-1">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-7 w-7" title={LABEL.BACK_TO_CONNECTIONS} onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={LABEL.CLOSE}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* Saved queries */}
            {savedQueries.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  <BookmarkCheck className="w-3 h-3" />
                  {LABEL.SAVED_QUERIES}
                </div>
                {savedQueries.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center gap-1 px-2 py-2 rounded text-xs hover:bg-sidebar-accent cursor-pointer group"
                    onClick={() => { onSelectSavedQuery(q); onClose(); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") { onSelectSavedQuery(q); onClose(); } }}
                  >
                    <Star className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate flex-1">{q.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSavedQuery(q.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      aria-label="Delete saved query"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Databases header */}
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <Database className="w-3 h-3" />
              {LABEL.DATABASES}
            </div>

            {dbsLoading ? (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              databases.map((db) => (
                <div key={db.name}>
                  <div
                    onClick={() => { onToggleDb(db.name); onSelectDb(db.name); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onToggleDb(db.name); onSelectDb(db.name); } }}
                    role="button"
                    tabIndex={0}
                    className={`w-full flex items-center gap-1.5 px-2 py-2.5 rounded text-sm hover:bg-sidebar-accent transition-colors cursor-pointer ${
                      database === db.name ? "bg-sidebar-accent" : "text-sidebar-foreground/80"
                    }`}
                  >
                    {expandedDbs.has(db.name) ? (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    )}
                    <Database className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                    <span className="truncate font-mono text-xs flex-1">{db.name}</span>
                    {db.collectionCount !== undefined && (
                      <span className="text-[10px] text-muted-foreground">{db.collectionCount}</span>
                    )}
                  </div>

                  {expandedDbs.has(db.name) && database === db.name && (
                    <div className="ml-3 pl-2 border-l border-border">
                      {colsLoading ? (
                        <div className="space-y-1 py-1">
                          {[1, 2].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
                        </div>
                      ) : (
                        <div className="space-y-0.5 py-1">
                          {collections.map((col) => (
                            <div
                              key={col.name}
                              onClick={() => { onSelectCollection(db.name, col.name); onClose(); }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onSelectCollection(db.name, col.name); onClose(); } }}
                              role="button"
                              tabIndex={0}
                              className={`w-full flex items-center gap-1.5 px-2 py-2 rounded text-xs hover:bg-sidebar-accent transition-colors cursor-pointer ${
                                collection === col.name ? "bg-primary/20 text-primary" : "text-sidebar-foreground/70"
                              }`}
                            >
                              <Layers className="w-3 h-3 shrink-0" />
                              <span className="truncate font-mono flex-1">{col.name}</span>
                            </div>
                          ))}
                          <button
                            onClick={() => { onCreateCollection(); onClose(); }}
                            className="w-full flex items-center gap-1.5 px-2 py-2 rounded text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-primary transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{LABEL.CREATE_COLLECTION}</span>
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
    </>
  );
}
