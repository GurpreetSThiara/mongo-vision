/**
 * ExplorerSidebar
 *
 * Desktop left sidebar: MongoVision branding, saved queries list,
 * database/collection tree with expand/collapse and drop actions.
 *
 * App-UI component — feature-specific, not a generic atom.
 */
import { Link } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, ChevronRight, ChevronDown, Layers, Plus,
  Trash2, BookmarkCheck, Star, ArrowLeft,
} from "lucide-react";
import { APP_NAME } from "@/constants";
import { LABEL } from "@/constants/messages";

interface DbEntry { name: string; collectionCount?: number }
interface ColEntry { name: string }

interface ExplorerSidebarProps {
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
  onSelectSavedQuery: (q: { id: string; name: string; query: any }) => void;
  onDeleteSavedQuery: (id: string) => void;
}

export function ExplorerSidebar({
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
}: ExplorerSidebarProps) {
  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0 hidden md:flex">
      {/* Brand header */}
      <div className="h-16 border-b border-border flex items-center px-4 gap-2">
        <Database className="w-5 h-5 text-primary" />
        <span className="font-bold font-mono text-sm">{APP_NAME}</span>
        <Link href="/" className="ml-auto">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title={LABEL.BACK_TO_CONNECTIONS}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
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
                  className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-sidebar-accent cursor-pointer group"
                  onClick={() => onSelectSavedQuery(q)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") onSelectSavedQuery(q); }}
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

          {/* Databases */}
          <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <Database className="w-3 h-3" />
            {LABEL.DATABASES}
          </div>

          {dbsLoading ? (
            <div className="space-y-1 px-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : (
            databases.map((db) => (
              <div key={db.name}>
                <div className="group relative">
                  <div
                    onClick={() => { onToggleDb(db.name); onSelectDb(db.name); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onToggleDb(db.name); onSelectDb(db.name); } }}
                    role="button"
                    tabIndex={0}
                    data-testid={`db-${db.name}`}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-sidebar-accent transition-colors cursor-pointer ${
                      database === db.name ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80"
                    }`}
                  >
                    {expandedDbs.has(db.name) ? (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    )}
                    <Database className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                    <span className="truncate font-mono text-xs flex-1 text-left">{db.name}</span>
                    {db.collectionCount !== undefined && (
                      <span className="text-[10px] text-muted-foreground mr-1">{db.collectionCount}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDropDb(db.name); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                      aria-label={`Drop database ${db.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {expandedDbs.has(db.name) && database === db.name && (
                  <div className="ml-3 pl-2 border-l border-border">
                    {colsLoading ? (
                      <div className="space-y-1 py-1">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
                      </div>
                    ) : (
                      <div className="space-y-0.5 py-1">
                        {collections.map((col) => (
                          <div key={col.name} className="group relative">
                            <div
                              onClick={() => onSelectCollection(db.name, col.name)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectCollection(db.name, col.name); }}
                              role="button"
                              tabIndex={0}
                              data-testid={`collection-${col.name}`}
                              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-sidebar-accent transition-colors cursor-pointer ${
                                collection === col.name ? "bg-primary/20 text-primary" : "text-sidebar-foreground/70"
                              }`}
                            >
                              <Layers className="w-3 h-3 shrink-0" />
                              <span className="truncate font-mono flex-1 text-left">{col.name}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDropCollection(db.name, col.name); }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-opacity"
                                aria-label={`Drop collection ${col.name}`}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={onCreateCollection}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-sidebar-accent hover:text-primary transition-colors"
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
  );
}
