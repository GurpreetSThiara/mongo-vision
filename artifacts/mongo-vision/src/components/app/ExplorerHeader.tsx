/**
 * ExplorerHeader
 *
 * Desktop top header for the collection view: breadcrumb, document count,
 * and Export / Import / Insert action buttons.
 *
 * App-UI component — shown only on md+ screens.
 */
import { ChevronRight, Download, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LABEL } from "@/constants/messages";

interface ExplorerHeaderProps {
  database: string;
  collection: string;
  connectionId: string;
  totalDocs?: number;
  selectedDocsCount: number;
  onExport: () => void;
  onImport: () => void;
  onInsert: () => void;
}

export function ExplorerHeader({
  database,
  collection,
  connectionId,
  totalDocs,
  selectedDocsCount,
  onExport,
  onImport,
  onInsert,
}: ExplorerHeaderProps) {
  if (!collection) return null;

  return (
    <div className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card shrink-0 hidden lg:flex">
      <span className="text-muted-foreground text-sm font-mono">{database}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm font-mono font-medium">{collection}</span>
      {totalDocs != null && (
        <Badge variant="outline" className="text-xs">
          {totalDocs.toLocaleString()} docs
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={onExport}
        >
          <Download className="w-3 h-3" />
          {LABEL.EXPORT}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={onImport}
        >
          <Upload className="w-3 h-3" />
          {LABEL.IMPORT}
        </Button>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={onInsert}>
          <Plus className="w-3 h-3" />
          {LABEL.INSERT}
        </Button>
      </div>
    </div>
  );
}
