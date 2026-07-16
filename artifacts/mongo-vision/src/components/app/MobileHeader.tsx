/**
 * MobileHeader
 *
 * Compact top header for mobile viewport (< 768px):
 * - Hamburger icon → opens sidebar drawer
 * - Current db/collection breadcrumb (truncated)
 * - Actions overflow menu (Insert, Export, Import)
 *
 * App-UI component — visible only on mobile.
 */
import { Menu, Plus, Download, Upload, ChevronRight, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants";
import { LABEL } from "@/constants/messages";
import { Database } from "lucide-react";
import { useState } from "react";

interface MobileHeaderProps {
  database: string;
  collection: string;
  onOpenDrawer: () => void;
  onInsert: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function MobileHeader({
  database,
  collection,
  onOpenDrawer,
  onInsert,
  onExport,
  onImport,
}: MobileHeaderProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <div className="h-12 border-b border-border flex items-center px-3 gap-2 bg-card shrink-0 md:hidden relative">
      {/* Hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onOpenDrawer}
        aria-label={LABEL.OPEN_NAVIGATION}
      >
        <Menu className="w-4 h-4" />
      </Button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-1 min-w-0 text-xs font-mono">
        {database && collection ? (
          <>
            <span className="text-muted-foreground truncate max-w-[80px]">{database}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{collection}</span>
          </>
        ) : database ? (
          <span className="font-medium truncate">{database}</span>
        ) : (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Database className="w-3 h-3" />
            <span>{APP_NAME}</span>
          </div>
        )}
      </div>

      {/* Overflow menu (only when in a collection) */}
      {collection && (
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-label={LABEL.ACTIONS}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>

          {overflowOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOverflowOpen(false)}
              />
              {/* Menu */}
              <div className="absolute right-0 top-9 z-50 w-40 bg-card border border-border rounded-lg shadow-xl py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setOverflowOpen(false); onInsert(); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {LABEL.INSERT}
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setOverflowOpen(false); onExport(); }}
                >
                  <Download className="w-3.5 h-3.5" />
                  {LABEL.EXPORT}
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setOverflowOpen(false); onImport(); }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {LABEL.IMPORT}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
